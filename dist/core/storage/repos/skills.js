import { buildInsert, buildUpdate } from "../tx.js";
import { scanAndTopK } from "../vector.js";
import { buildPageClauses, fromBlob, fromJsonText, joinWhere, normalizeShareForStorage, ownerFieldsFromRaw, ownerParamsFromRow, toBlob, toJsonText, } from "./_helpers.js";
export const IDLE_ARCHIVE_BATCH_LIMIT = 500;
const IDLE_ARCHIVE_PREDICATE = "status = 'active' AND eta < @min_eta AND COALESCE(last_used_at, created_at) <= @cutoff";
const COLUMNS = [
    "id",
    "owner_agent_kind",
    "owner_profile_id",
    "owner_workspace_id",
    "name",
    "status",
    "invocation_guide",
    "procedure_json",
    "eta",
    "support",
    "gain",
    "trials_attempted",
    "trials_passed",
    "source_policies_json",
    "source_world_json",
    "vec",
    "created_at",
    "updated_at",
    "version",
    "share_scope",
    "share_target",
    "shared_at",
    "edited_at",
    "evidence_anchors_json",
    "usage_count",
    "last_used_at",
];
export function makeSkillsRepo(db) {
    const insert = db.prepare(buildInsert({ table: "skills", columns: COLUMNS }));
    const upsert = db.prepare(buildInsert({ table: "skills", columns: COLUMNS, onConflict: "replace" }));
    const updateStatus = db.prepare(buildUpdate({ table: "skills", columns: ["id", "status", "updated_at"] }));
    const updateTrials = db.prepare(buildUpdate({
        table: "skills",
        columns: ["id", "trials_attempted", "trials_passed", "eta", "updated_at"],
    }));
    const selectById = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM skills WHERE id=@id`);
    const selectByName = db.prepare(`SELECT ${COLUMNS.join(", ")} FROM skills WHERE name=@name`);
    return {
        insert(row) {
            insert.run(rowToParams(row));
        },
        upsert(row) {
            upsert.run(rowToParams(row));
        },
        setStatus(id, status, updatedAt) {
            updateStatus.run({ id, status, updated_at: updatedAt });
        },
        /**
         * Atomically select and archive one oldest-first batch. Keeping candidate
         * selection and the conditional transition in one SQLite statement
         * removes the read/update race and avoids hundreds of UPDATE round-trips.
         */
        archiveNextIdleBatch(input) {
            const requestedLimit = Number.isFinite(input.limit)
                ? Math.floor(input.limit)
                : IDLE_ARCHIVE_BATCH_LIMIT;
            const params = {
                min_eta: input.minEtaForRetrieval,
                cutoff: input.cutoff,
                updated_at: input.updatedAt,
                limit: Math.max(1, Math.min(IDLE_ARCHIVE_BATCH_LIMIT, requestedLimit)),
            };
            const sql = `
        WITH candidates AS (
          SELECT id
            FROM skills
           WHERE ${IDLE_ARCHIVE_PREDICATE}
           ORDER BY COALESCE(last_used_at, created_at) ASC
           LIMIT @limit
        )
        UPDATE skills
           SET status = 'archived', updated_at = @updated_at
         WHERE id IN (SELECT id FROM candidates)
           AND ${IDLE_ARCHIVE_PREDICATE}
        RETURNING ${COLUMNS.join(", ")}`;
            return db.prepare(sql).all(params).map(mapRow);
        },
        bumpTrial(id, passed, updatedAt) {
            const row = selectById.get({ id });
            if (!row)
                throw new Error(`[skills] bumpTrial: not found: ${id}`);
            const trialsAttempted = row.trials_attempted + 1;
            const trialsPassed = row.trials_passed + (passed ? 1 : 0);
            const eta = trialEtaWithPrior(row.eta, row.trials_attempted, row.trials_passed, trialsAttempted, trialsPassed);
            updateTrials.run({
                id,
                trials_attempted: trialsAttempted,
                trials_passed: trialsPassed,
                eta,
                updated_at: updatedAt,
            });
            return { trialsAttempted, trialsPassed, eta };
        },
        getById(id) {
            const r = selectById.get({ id });
            return r ? mapRow(r) : null;
        },
        getByName(name) {
            const r = selectByName.get({ name });
            return r ? mapRow(r) : null;
        },
        list(filter = {}) {
            const fragments = [];
            const params = {};
            if (filter.status) {
                fragments.push(`status = @status`);
                params.status = filter.status;
            }
            if (filter.minEta !== undefined) {
                fragments.push(`eta >= @min_eta`);
                params.min_eta = filter.minEta;
            }
            const where = joinWhere(fragments);
            const page = buildPageClauses(filter, "updated_at");
            const sql = `SELECT ${COLUMNS.join(", ")} FROM skills ${where} ${page}`;
            return db.prepare(sql).all(params).map(mapRow);
        },
        count(filter = {}) {
            const fragments = [];
            const params = {};
            if (filter.status) {
                fragments.push(`status = @status`);
                params.status = filter.status;
            }
            if (filter.minEta !== undefined) {
                fragments.push(`eta >= @min_eta`);
                params.min_eta = filter.minEta;
            }
            const where = joinWhere(fragments);
            const sql = `SELECT COUNT(*) AS n FROM skills ${where}`;
            return db.prepare(sql).get(params)?.n ?? 0;
        },
        searchByVector(query, k, opts = {}) {
            const statusIn = opts.statusIn;
            const whereParts = ["vec IS NOT NULL"];
            const params = {};
            if (statusIn && statusIn.length > 0) {
                const placeholders = statusIn.map((_, i) => `@status_${i}`).join(",");
                whereParts.push(`status IN (${placeholders})`);
                statusIn.forEach((s, i) => {
                    params[`status_${i}`] = s;
                });
            }
            return scanAndTopK(db, "skills", ["name", "status", "eta", "gain", "owner_agent_kind", "owner_profile_id", "owner_workspace_id"], query, k, {
                vecColumn: "vec",
                where: whereParts.join(" AND "),
                params,
                hardCap: opts.hardCap,
            });
        },
        /**
         * Keyword channel — FTS5 trigram MATCH against `skills_fts`.
         * Indices `name` + `invocation_guide`. Returns hits with the same
         * `meta` shape `searchByVector` produces so the retrieval ranker
         * can fuse channels via RRF.
         */
        searchByText(ftsMatch, k, opts = {}) {
            if (!ftsMatch || k <= 0)
                return [];
            const params = {
                match: ftsMatch,
                k: Math.max(1, Math.min(200, Math.floor(k))),
            };
            const whereParts = [];
            if (opts.statusIn && opts.statusIn.length > 0) {
                const placeholders = opts.statusIn.map((_, i) => `@status_${i}`).join(",");
                whereParts.push(`s.status IN (${placeholders})`);
                opts.statusIn.forEach((st, i) => {
                    params[`status_${i}`] = st;
                });
            }
            const extra = whereParts.length > 0 ? ` AND ${whereParts.join(" AND ")}` : "";
            const sql = `
        SELECT s.id   AS id,
               s.name AS name,
               s.status AS status,
               s.eta  AS eta,
               s.gain AS gain,
               s.owner_agent_kind AS owner_agent_kind,
               s.owner_profile_id AS owner_profile_id,
               s.owner_workspace_id AS owner_workspace_id
          FROM skills_fts f
          JOIN skills      s ON s.id = f.skill_id
         WHERE skills_fts MATCH @match${extra}
         ORDER BY rank
         LIMIT @k`;
            const rows = db
                .prepare(sql)
                .all(params);
            return rows.map((r, idx) => ({
                id: r.id,
                score: 1 / (idx + 1),
                meta: { name: r.name, status: r.status, eta: r.eta, gain: r.gain, owner_agent_kind: r.owner_agent_kind, owner_profile_id: r.owner_profile_id, owner_workspace_id: r.owner_workspace_id },
            }));
        },
        /**
         * Pattern channel — substring fallback for short queries (e.g. 2-char
         * CJK). Searched over `name` + `invocation_guide`.
         */
        searchByPattern(terms, k, opts = {}) {
            if (!terms || terms.length === 0 || k <= 0)
                return [];
            const dedup = Array.from(new Set(terms.map((t) => String(t).trim()).filter(Boolean)));
            if (dedup.length === 0)
                return [];
            const params = {
                k: Math.max(1, Math.min(200, Math.floor(k))),
            };
            const ors = [];
            const matchScores = [];
            const limitedTerms = dedup.slice(0, 16);
            limitedTerms.forEach((t, i) => {
                const key = `pat_${i}`;
                const escaped = t.replace(/[\\%_]/g, (m) => `\\${m}`);
                params[key] = `%${escaped}%`;
                const match = `(name LIKE @${key} ESCAPE '\\' OR invocation_guide LIKE @${key} ESCAPE '\\')`;
                ors.push(match);
                matchScores.push(`CASE WHEN ${match} THEN 1 ELSE 0 END`);
            });
            const whereParts = [`(${ors.join(" OR ")})`];
            if (opts.statusIn && opts.statusIn.length > 0) {
                const placeholders = opts.statusIn.map((_, i) => `@status_${i}`).join(",");
                whereParts.push(`status IN (${placeholders})`);
                opts.statusIn.forEach((st, i) => {
                    params[`status_${i}`] = st;
                });
            }
            const sql = `
        SELECT id, name, status, eta, gain, owner_agent_kind, owner_profile_id,
               owner_workspace_id, (${matchScores.join(" + ")}) AS pattern_matches
          FROM skills
         WHERE ${whereParts.join(" AND ")}
         ORDER BY pattern_matches DESC, updated_at DESC
         LIMIT @k`;
            const rows = db
                .prepare(sql)
                .all(params);
            return rows.map((r) => ({
                id: r.id,
                score: r.pattern_matches / limitedTerms.length,
                meta: { name: r.name, status: r.status, eta: r.eta, gain: r.gain, owner_agent_kind: r.owner_agent_kind, owner_profile_id: r.owner_profile_id, owner_workspace_id: r.owner_workspace_id },
            }));
        },
        deleteById(id) {
            db.prepare(`DELETE FROM skills WHERE id=@id`).run({ id });
        },
        /**
         * Apply a share-state transition. `scope = null` clears the share
         * fields and resets `shared_at`. Mirrors `traces.updateShare`.
         */
        updateShare(id, share) {
            db.prepare(`UPDATE skills SET share_scope=@share_scope, share_target=@share_target, shared_at=@shared_at WHERE id=@id`).run({
                id,
                share_scope: normalizeShareForStorage(share.scope),
                share_target: share.target ?? null,
                shared_at: share.sharedAt ?? null,
            });
        },
        /**
         * User-driven content patch from the viewer's edit modal. Only the
         * narrowly user-facing fields are mutable here; trial counters,
         * vectors, and source ids stay owned by the algorithm pipeline.
         * Stamps `edited_at = Date.now()` whenever any field changes.
         */
        updateContent(id, patch) {
            const sets = [];
            const params = { id };
            if (patch.name !== undefined) {
                sets.push("name = @name");
                params.name = patch.name;
            }
            if (patch.invocationGuide !== undefined) {
                sets.push("invocation_guide = @invocation_guide");
                params.invocation_guide = patch.invocationGuide;
            }
            if (sets.length === 0)
                return;
            sets.push("edited_at = @edited_at");
            params.edited_at = Date.now();
            const sql = `UPDATE skills SET ${sets.join(", ")} WHERE id = @id`;
            db.prepare(sql).run(params);
        },
        updateVector(id, vec) {
            const res = db.prepare(`UPDATE skills SET vec=@vec, updated_at=@updated_at WHERE id=@id`).run({ id, vec: toBlob(vec), updated_at: Date.now() });
            return res.changes > 0;
        },
        recordUse(id, usedAt) {
            const res = db.prepare(`UPDATE skills
            SET usage_count = COALESCE(usage_count, 0) + 1,
                last_used_at = @last_used_at
          WHERE id = @id`).run({ id, last_used_at: usedAt });
            return res.changes > 0;
        },
    };
}
function trialEtaWithPrior(currentEta, previousAttempts, previousPasses, nextAttempts, nextPasses) {
    const priorStrength = 1;
    const priorEta = clamp01(currentEta * (priorStrength + previousAttempts) - previousPasses);
    return clamp01((priorEta * priorStrength + nextPasses) / (priorStrength + nextAttempts));
}
function rowToParams(row) {
    return {
        id: row.id,
        ...ownerParamsFromRow(row),
        name: row.name,
        status: row.status,
        invocation_guide: row.invocationGuide,
        procedure_json: toJsonText(row.procedureJson ?? null),
        eta: row.eta,
        support: row.support,
        gain: row.gain,
        trials_attempted: row.trialsAttempted,
        trials_passed: row.trialsPassed,
        source_policies_json: toJsonText(row.sourcePolicyIds),
        source_world_json: toJsonText(row.sourceWorldModelIds),
        vec: toBlob(row.vec),
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        version: row.version ?? 1,
        share_scope: normalizeShareForStorage(row.share?.scope),
        share_target: row.share?.target ?? null,
        shared_at: row.share?.sharedAt ?? null,
        edited_at: row.editedAt ?? null,
        evidence_anchors_json: toJsonText(row.evidenceAnchors),
        usage_count: row.usageCount ?? 0,
        last_used_at: row.lastUsedAt ?? null,
    };
}
function clamp01(n) {
    if (!Number.isFinite(n))
        return 0;
    if (n < 0)
        return 0;
    if (n > 1)
        return 1;
    return n;
}
function mapRow(r) {
    return {
        id: r.id,
        ...ownerFieldsFromRaw(r),
        name: r.name,
        status: r.status,
        invocationGuide: r.invocation_guide,
        procedureJson: fromJsonText(r.procedure_json, null),
        eta: r.eta,
        support: r.support,
        gain: r.gain,
        trialsAttempted: r.trials_attempted,
        trialsPassed: r.trials_passed,
        sourcePolicyIds: fromJsonText(r.source_policies_json, []),
        sourceWorldModelIds: fromJsonText(r.source_world_json, []),
        evidenceAnchors: fromJsonText(r.evidence_anchors_json, []),
        vec: fromBlob(r.vec),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        version: r.version ?? 1,
        share: r.share_scope != null
            ? {
                scope: normalizeShareForStorage(r.share_scope),
                target: r.share_target,
                sharedAt: r.shared_at,
            }
            : null,
        editedAt: r.edited_at,
        usageCount: r.usage_count ?? 0,
        lastUsedAt: r.last_used_at ?? null,
    };
}
//# sourceMappingURL=skills.js.map