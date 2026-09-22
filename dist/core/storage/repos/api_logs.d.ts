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
import type { StorageDb } from "../types.js";
export interface ApiLogRow {
    id: number;
    toolName: string;
    inputJson: string;
    outputJson: string;
    durationMs: number;
    success: boolean;
    calledAt: number;
}
export interface ApiLogInsert {
    toolName: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    success: boolean;
    calledAt?: number;
}
/** One tool's rollup over a time window — see `aggregateByTool`. */
export interface ApiLogToolAggregate {
    toolName: string;
    calls: number;
    errors: number;
    avgMs: number;
    lastTs: number;
    /** Sorted ascending; used for percentiles by the caller. */
    durationsMs: number[];
}
export interface ApiLogAggregateFilter {
    /** Only include rows with `called_at >= since` (epoch ms). */
    since?: number;
    /** Only include rows with `called_at <= until` (epoch ms). */
    until?: number;
    /** Restrict to these tools; omit for every tool. */
    toolNames?: readonly string[];
    /**
     * Safety valve: maximum rows sampled per tool when collecting the raw
     * durations used for percentiles. Counts and averages always cover the
     * full window (they are computed in SQL); only the percentile sample is
     * capped, and `durationsTruncated` tells the caller when that happened.
     */
    maxDurationsPerTool?: number;
}
export interface ApiLogFilter {
    /** Filter by a single tool name. */
    toolName?: string;
    /** Filter by several tool names while preserving newest-first pagination. */
    toolNames?: readonly string[];
    /** Default 50; max 500 to keep viewer paint times sane. */
    limit?: number;
    offset?: number;
}
export declare function makeApiLogsRepo(db: StorageDb): {
    insert(row: ApiLogInsert): void;
    count(filter?: Pick<ApiLogFilter, "toolName" | "toolNames">): number;
    list(filter?: ApiLogFilter): ApiLogRow[];
    /**
     * Per-tool rollup over a time window.
     *
     * Counts / errors / average come straight from SQL, so they cover every
     * row in the window no matter how large `api_logs` grows. The raw
     * durations are additionally collected (newest-first, capped at
     * `maxDurationsPerTool`) so the caller can compute percentiles without
     * a second round trip.
     */
    aggregateByTool(filter?: ApiLogAggregateFilter): ApiLogToolAggregate[];
};
//# sourceMappingURL=api_logs.d.ts.map