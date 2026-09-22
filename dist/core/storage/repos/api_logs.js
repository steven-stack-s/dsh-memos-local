/**
 * `api_logs` repository — structured log of the user-facing memory
 * operations (`memos_search`, `memory_add`). Mirrors the legacy
 * `memos-local-openclaw` plugin's table so the new viewer can render
 * the same rich JSON payloads (candidates, filtered, hub results,
 * ingestion stats, …).
 *
 * Schema: see `core/storage/migrations/007-api-logs.sql`.
 *
 * Write path: invoked synchronously inside the pipeline whenever we
 * complete a `memory.search` retrieval (adapter tool bridge) or an
 * `agent_end`-driven ingest turn.
 *
 * Read path: paginated newest-first by `called_at`. The viewer tails
 * the table via `GET /api/v1/api-logs`.
 */
export function makeApiLogsRepo(db) {
    const insert = db.prepare(`INSERT INTO api_logs (tool_name, input_json, output_json, duration_ms, success, called_at)
     VALUES (@tool_name, @input_json, @output_json, @duration_ms, @success, @called_at)`);
    const countAll = db.prepare(`SELECT COUNT(*) AS n FROM api_logs`);
    const countByTool = db.prepare(`SELECT COUNT(*) AS n FROM api_logs WHERE tool_name = @tool_name`);
    const selectAll = db.prepare(`SELECT id, tool_name, input_json, output_json, duration_ms, success, called_at
     FROM api_logs
     ORDER BY called_at DESC, id DESC
     LIMIT @limit OFFSET @offset`);
    const selectByTool = db.prepare(`SELECT id, tool_name, input_json, output_json, duration_ms, success, called_at
     FROM api_logs
     WHERE tool_name = @tool_name
     ORDER BY called_at DESC, id DESC
     LIMIT @limit OFFSET @offset`);
    // ── Time-window aggregation (Analytics tool panel) ──────────────
    // Done in SQL on purpose. The previous implementation pulled a page of
    // rows via `list()` (hard-capped at 500) and aggregated in JS, so a
    // 24h/7d/30d window was silently computed from the most recent 500 rows
    // only — a ~98% under-count on a 12k-row table. COUNT/SUM/AVG here cover
    // the whole window regardless of table size.
    const aggregateWindow = db.prepare(`SELECT tool_name,
            COUNT(*)                                   AS calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(duration_ms)                           AS total_ms,
            MAX(called_at)                             AS last_ts
       FROM api_logs
      WHERE called_at >= @since AND called_at <= @until
      GROUP BY tool_name`);
    const aggregateWindowForTools = db.prepare(`SELECT tool_name,
            COUNT(*)                                   AS calls,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors,
            SUM(duration_ms)                           AS total_ms,
            MAX(called_at)                             AS last_ts
       FROM api_logs
      WHERE called_at >= @since AND called_at <= @until AND tool_name = @tool_name
      GROUP BY tool_name`);
    // Newest-first duration sample per tool, used ONLY for percentiles.
    // Deliberately capped: percentiles do not need every row, and an
    // unbounded read would reintroduce the memory blow-up this whole
    // SQL-side aggregation exists to avoid.
    const selectDurations = db.prepare(`SELECT duration_ms FROM api_logs
      WHERE tool_name = @tool_name AND called_at >= @since AND called_at <= @until
      ORDER BY called_at DESC, id DESC
      LIMIT @limit`);
    const countByToolNames = (toolNames) => {
        const names = normalizeToolNames(toolNames);
        if (names.length === 0)
            return countAll.get({})?.n ?? 0;
        if (names.length === 1) {
            return countByTool.get({ tool_name: names[0] })?.n ?? 0;
        }
        const params = namedToolParams(names);
        const placeholders = Object.keys(params).map((key) => `@${key}`).join(", ");
        const row = db
            .prepare(`SELECT COUNT(*) AS n FROM api_logs WHERE tool_name IN (${placeholders})`)
            .get(params);
        return row?.n ?? 0;
    };
    const selectByToolNames = (toolNames, limit, offset) => {
        const names = normalizeToolNames(toolNames);
        if (names.length === 0)
            return selectAll.all({ limit, offset });
        if (names.length === 1) {
            return selectByTool.all({ tool_name: names[0], limit, offset });
        }
        const toolParams = namedToolParams(names);
        const placeholders = Object.keys(toolParams).map((key) => `@${key}`).join(", ");
        return db
            .prepare(`SELECT id, tool_name, input_json, output_json, duration_ms, success, called_at
         FROM api_logs
         WHERE tool_name IN (${placeholders})
         ORDER BY called_at DESC, id DESC
         LIMIT @limit OFFSET @offset`)
            .all({ ...toolParams, limit, offset });
    };
    return {
        insert(row) {
            insert.run({
                tool_name: row.toolName,
                input_json: typeof row.input === "string" ? row.input : safeStringify(row.input),
                output_json: typeof row.output === "string" ? row.output : safeStringify(row.output),
                duration_ms: Math.max(0, Math.floor(row.durationMs)),
                success: row.success ? 1 : 0,
                called_at: row.calledAt ?? Date.now(),
            });
        },
        count(filter = {}) {
            if (filter.toolNames?.length) {
                return countByToolNames(filter.toolNames);
            }
            if (filter.toolName) {
                return countByTool.get({ tool_name: filter.toolName })?.n ?? 0;
            }
            return countAll.get({})?.n ?? 0;
        },
        list(filter = {}) {
            const limit = Math.max(1, Math.min(500, filter.limit ?? 50));
            const offset = Math.max(0, filter.offset ?? 0);
            const rows = filter.toolNames?.length
                ? selectByToolNames(filter.toolNames, limit, offset)
                : filter.toolName
                    ? selectByTool.all({ tool_name: filter.toolName, limit, offset })
                    : selectAll.all({ limit, offset });
            return rows.map(mapRow);
        },
        /**
         * Per-tool rollup over a time window.
         *
         * Counts / errors / average come straight from SQL, so they cover every
         * row in the window no matter how large `api_logs` grows. The raw
         * durations are additionally collected (newest-first, capped at
         * `maxDurationsPerTool`) so the caller can compute percentiles without
         * a second round trip.
         */
        aggregateByTool(filter = {}) {
            const since = Number.isFinite(filter.since) ? filter.since : 0;
            const until = Number.isFinite(filter.until) ? filter.until : Number.MAX_SAFE_INTEGER;
            const maxDurations = Math.max(1, Math.min(20_000, filter.maxDurationsPerTool ?? 2_000));
            const names = filter.toolNames?.length
                ? normalizeToolNames(filter.toolNames)
                : null;
            const rows = names
                ? names
                    .map((name) => aggregateWindowForTools.get({ since, until, tool_name: name }))
                    .filter((r) => r != null)
                : aggregateWindow.all({ since, until });
            return rows.map((r) => {
                const durations = selectDurations
                    .all({ tool_name: r.tool_name, since, until, limit: maxDurations })
                    .map((d) => Math.max(0, d.duration_ms))
                    .sort((a, b) => a - b);
                return {
                    toolName: r.tool_name,
                    calls: r.calls,
                    errors: r.errors,
                    // Guard against a zero-row group (impossible with GROUP BY, but
                    // keeps the division honest if the query ever changes).
                    avgMs: r.calls > 0 ? r.total_ms / r.calls : 0,
                    lastTs: r.last_ts,
                    durationsMs: durations,
                };
            });
        },
    };
}
function normalizeToolNames(toolNames) {
    return [...new Set(toolNames.map((name) => name.trim()).filter(Boolean))];
}
function namedToolParams(toolNames) {
    return Object.fromEntries(toolNames.map((name, index) => [`tool_${index}`, name]));
}
function mapRow(r) {
    return {
        id: r.id,
        toolName: r.tool_name,
        inputJson: r.input_json,
        outputJson: r.output_json,
        durationMs: r.duration_ms,
        success: !!r.success,
        calledAt: r.called_at,
    };
}
function safeStringify(v) {
    try {
        return JSON.stringify(v ?? {});
    }
    catch {
        return "{}";
    }
}
//# sourceMappingURL=api_logs.js.map