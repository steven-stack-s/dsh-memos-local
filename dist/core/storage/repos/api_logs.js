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