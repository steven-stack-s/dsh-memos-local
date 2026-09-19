import { buildInsert, buildUpdate } from "../tx.js";
import { buildPageClauses, clampLimit, fromJsonText, joinWhere, normalizeShareForStorage, ownerFieldsFromRaw, ownerParamsFromRow, timeRangeWhere, toJsonText, } from "./_helpers.js";
const COLUMNS = [
    "id",
    "session_id",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "share_scope",
    "started_at",
    "ended_at",
    "trace_ids_json",
    "r_task",
    "status",
    "meta_json",
];
export function makeEpisodesRepo(db) {
    const insert = db.prepare(buildInsert({ table: "episodes", columns: COLUMNS }));
    const replace = db.prepare(buildInsert({ table: "episodes", columns: COLUMNS, onConflict: "replace" }));
    const updateStatus = db.prepare(buildUpdate({ table: "episodes", columns: ["id", "status", "ended_at"] }));
    const appendTrace = db.prepare(buildUpdate({ table: "episodes", columns: ["id", "trace_ids_json"] }));
    const selectById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM episodes WHERE id=@id`);
    const deleteById = db.prepare(`DELETE FROM episodes WHERE id=@id`);
    const selectOpenForSession = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM episodes WHERE session_id=@session AND status='open' ORDER BY started_at DESC LIMIT 1`);
    return {
        insert(row) {
            insert.run({
                id: row.id,
                session_id: row.sessionId,
                ...ownerParamsFromRow(row),
                share_scope: normalizeShareForStorage(row.share?.scope),
                started_at: row.startedAt,
                ended_at: row.endedAt ?? null,
                trace_ids_json: toJsonText(row.traceIds),
                r_task: row.rTask ?? null,
                status: row.status,
                meta_json: toJsonText(row.meta ?? {}),
            });
        },
        upsert(row) {
            replace.run({
                id: row.id,
                session_id: row.sessionId,
                ...ownerParamsFromRow(row),
                share_scope: normalizeShareForStorage(row.share?.scope),
                started_at: row.startedAt,
                ended_at: row.endedAt ?? null,
                trace_ids_json: toJsonText(row.traceIds),
                r_task: row.rTask ?? null,
                status: row.status,
                meta_json: toJsonText(row.meta ?? {}),
            });
        },
        close(id, endedAt, rTask) {
            updateStatus.run({ id, status: "closed", ended_at: endedAt });
            if (rTask !== undefined) {
                db.prepare(`UPDATE episodes SET r_task=@r WHERE id=@id`).run({ id, r: rTask });
            }
        },
        /**
         * Flip a closed episode back to `status='open'` (V7 §0.1 revision
         * path). Surgical UPDATE on the status column only — must NEVER
         * be implemented via `upsert`, which is `INSERT OR REPLACE` and
         * would cascade-delete every trace for the episode.
         */
        reopen(id) {
            db.prepare(`UPDATE episodes SET status='open', ended_at=NULL WHERE id=@id`).run({ id });
        },
        setRTask(id, rTask) {
            db.prepare(`UPDATE episodes SET r_task=@r WHERE id=@id`).run({ id, r: rTask });
        },
        updateMeta(id, metaPatch) {
            const current = selectById.get({ id });
            if (!current)
                return;
            const existing = fromJsonText(current.meta_json, {});
            const merged = { ...existing, ...metaPatch };
            db.prepare(`UPDATE episodes SET meta_json=@meta WHERE id=@id`).run({ id, meta: toJsonText(merged) });
        },
        appendTrace(id, traceIds) {
            // Strip ghost trace IDs (entries that do not exist in the `traces`
            // table) before persisting. Otherwise a single orphan ID lingering in
            // `trace_ids_json` keeps the reward dirty-check tripping in a loop
            // (#1966 — 590 wasted rescore calls in 5 days). The filter preserves
            // input order and de-duplicates.
            const validated = filterTraceIdsToExisting(db, traceIds);
            appendTrace.run({ id, trace_ids_json: toJsonText(validated) });
        },
        removeTraceIds(id, traceIds) {
            if (traceIds.length === 0)
                return;
            const current = selectById.get({ id });
            if (!current)
                return;
            const remove = new Set(traceIds);
            const kept = fromJsonText(current.trace_ids_json, []).filter((traceId) => !remove.has(traceId));
            appendTrace.run({ id, trace_ids_json: toJsonText(kept) });
        },
        deleteById(id) {
            deleteById.run({ id });
        },
        getById(id) {
            const r = selectById.get({ id });
            if (!r)
                return null;
            return mapRow(r);
        },
        getOpenForSession(sessionId) {
            const r = selectOpenForSession.get({ session: sessionId });
            if (!r)
                return null;
            return mapRow(r);
        },
        list(filter = {}) {
            const tr = timeRangeWhere(filter, "started_at");
            const fragments = [];
            const params = { ...tr.params };
            if (filter.sessionId) {
                fragments.push(`session_id = @session_id`);
                params.session_id = filter.sessionId;
            }
            if (filter.status) {
                fragments.push(`status = @status`);
                params.status = filter.status;
            }
            if (tr.sql)
                fragments.push(tr.sql);
            const where = joinWhere(fragments);
            const page = buildPageClauses(filter, "started_at");
            const sql = `SELECT ${COLUMNS.join(", ")} FROM episodes ${where} ${page}`;
            return db.prepare(sql).all(params).map(mapRow);
        },
        /**
         * Return one stable, newest-first page of closed episodes. A cursor keeps
         * scans progressing when new rows are inserted ahead of an earlier page.
         */
        listClosedPage(opts = {}) {
            const limit = clampLimit(opts.limit ?? 500);
            const params = { status: "closed" };
            const fragments = ["status = @status"];
            if (opts.before) {
                fragments.push("(started_at < @before_started_at OR (started_at = @before_started_at AND id < @before_id))");
                params.before_started_at = opts.before.startedAt;
                params.before_id = opts.before.id;
            }
            const where = joinWhere(fragments);
            const sql = `SELECT ${COLUMNS.join(", ")} FROM episodes ${where} ORDER BY started_at DESC, id DESC LIMIT ${limit}`;
            return db.prepare(sql).all(params).map(mapRow);
        },
        count(filter = {}) {
            const tr = timeRangeWhere(filter, "started_at");
            const fragments = [];
            const params = { ...tr.params };
            if (filter.sessionId) {
                fragments.push(`session_id = @session_id`);
                params.session_id = filter.sessionId;
            }
            if (filter.status) {
                fragments.push(`status = @status`);
                params.status = filter.status;
            }
            if (tr.sql)
                fragments.push(tr.sql);
            const where = joinWhere(fragments);
            const sql = `SELECT COUNT(*) AS n FROM episodes ${where}`;
            return db.prepare(sql).get(params)?.n ?? 0;
        },
    };
}
function mapRow(r) {
    return {
        id: r.id,
        sessionId: r.session_id,
        ...ownerFieldsFromRaw(r),
        share: { scope: normalizeShareForStorage(r.share_scope) },
        startedAt: r.started_at,
        endedAt: r.ended_at,
        traceIds: fromJsonText(r.trace_ids_json, []),
        rTask: r.r_task,
        status: r.status,
        meta: fromJsonText(r.meta_json, {}),
    };
}
/**
 * Return the subset of `traceIds` that have a backing row in the `traces`
 * table, preserving input order and de-duplicating. Empty array short-circuits.
 *
 * Lives in `episodes.ts` so the repo is self-contained — it does not import
 * `traces.ts` to avoid a circular module. Uses the same chunking strategy as
 * `traces.filterExistingIds` to stay under SQLite's bound-parameter limit.
 */
function filterTraceIdsToExisting(db, traceIds) {
    if (!traceIds || traceIds.length === 0)
        return [];
    const dedup = Array.from(new Set(traceIds));
    const existing = new Set();
    const CHUNK_SIZE = 900;
    for (let i = 0; i < dedup.length; i += CHUNK_SIZE) {
        const chunk = dedup.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "?").join(",");
        const sql = `SELECT id FROM traces WHERE id IN (${placeholders})`;
        const rows = db.prepare(sql).all(chunk);
        for (const r of rows)
            existing.add(r.id);
    }
    return dedup.filter((id) => existing.has(id));
}
//# sourceMappingURL=episodes.js.map