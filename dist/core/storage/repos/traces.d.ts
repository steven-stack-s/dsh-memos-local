import type { ToolCallDTO } from "../../../agent-contract/dto.js";
import type { EmbeddingVector, EpisodeId, SessionId, ShareScope, TraceId, TraceRow } from "../../types.js";
import type { StorageDb, TraceListFilter } from "../types.js";
import { type VectorHit, type VectorRow } from "../vector.js";
export type TraceSearchMeta = {
    ts: number;
    priority: number;
    value: number;
    episode_id: EpisodeId;
    session_id: SessionId;
    owner_agent_kind?: string;
    owner_profile_id?: string;
    owner_workspace_id?: string | null;
    tags_json?: string;
    error_signatures_json?: string;
};
/**
 * Narrow row shape returned by {@link listDedupRowsForEpisode}. Includes
 * exactly the fields the capture-side dedup path needs (see
 * `traceIdentitySignature` / `runLite` / `runLightweight` in
 * `core/capture/capture.ts`). Deliberately excludes the two big BLOB
 * columns (`vec_summary`, `vec_action`) so an episode with 500k rows
 * can be scanned without pulling ~4 GB of embeddings into JS memory —
 * the root pathology in #2076.
 */
export interface TraceDedupRow {
    ts: number;
    turnId: number;
    userText: string;
    agentText: string;
    toolCalls: ToolCallDTO[];
}
export declare function makeTracesRepo(db: StorageDb): {
    insert(row: TraceRow): void;
    upsert(row: TraceRow): void;
    updateScore(id: TraceId, scores: {
        value: number;
        alpha: number;
        rHuman?: number | null;
        priority: number;
    }): void;
    getById(id: TraceId): TraceRow | null;
    latestTimestamp(): number | null;
    getManyByIds(ids: readonly TraceId[]): TraceRow[];
    /**
     * Cheap existence check: does ANY trace in `ids` carry a timestamp
     * strictly greater than `ts`?
     *
     * Designed for the startup "dirty-closed-episode" scan in
     * `memory-core.init()` — the old code path called
     * `getManyByIds(ids).some(tr => tr.ts > ts)`, which hydrated every
     * column (embedding BLOBs, full `tool_calls_json` text, agent text)
     * purely to inspect a single number. On multi-hundred-MB databases
     * that single call dwarfed everything else during bridge bootstrap
     * (https://github.com/MemTensor/MemOS/issues/1787).
     *
     * This helper issues a single `SELECT 1 ... LIMIT 1` per chunk.
     * SQLite short-circuits as soon as it finds one match, so the cost
     * is O(chunk size) rather than O(total trace bytes).
     */
    hasAnyNewerThan(ids: readonly TraceId[], ts: number): boolean;
    /**
     * Count how many of the given IDs actually exist in the `traces` table.
     *
     * Used by the reward-dirty check
     * (https://github.com/MemTensor/MemOS/issues/1966) to tolerate "ghost"
     * trace IDs — entries that linger in `episodes.trace_ids_json` but whose
     * backing trace row was deleted (manual cleanup, schema migration, etc.).
     * Without this, comparing `reward.traceCount` against
     * `episode.traceIds.length` triggers an infinite rescore loop whenever
     * `length` includes ghosts that the reward pipeline already filtered out.
     *
     * Uses a single `SELECT COUNT(*)` per chunk so the cost is independent of
     * row size — embedding BLOBs and `tool_calls_json` are never read.
     */
    countExisting(ids: readonly TraceId[]): number;
    /**
     * Return the subset of `ids` that actually exist in the `traces` table,
     * preserving the input order and de-duplicating. Companion to
     * `countExisting`; used by `episodes.appendTrace` to strip ghost IDs at
     * write time (#1966).
     */
    filterExistingIds(ids: readonly TraceId[]): TraceId[];
    list(filter?: TraceListFilter): TraceRow[];
    /**
     * Full episode-scoped trace fetch with NO pagination cap.
     *
     * Fetches ALL columns including the large `vec_summary` and
     * `vec_action` BLOB columns, mapped into full `TraceRow` shape.
     * Use this only when the caller genuinely needs those BLOBs
     * (e.g. `runReflect`, which re-embeds and rewrites every field).
     *
     * **For dedup-only reads** — where only `ts`, `turnId`,
     * `userText`, `agentText`, and `toolCalls` are needed — use
     * {@link listDedupRowsForEpisode} instead to avoid loading
     * multi-GB of embeddings into JS memory.
     *
     * Why an uncapped read exists at all: the paginated
     * `list({ episodeId })` path silently truncates to
     * `PageOptions.limit` (default 500). That cap breaks capture-side
     * dedup (#2076): when an episode grows past the cap, the next
     * runLite / runReflect only sees the newest 500 rows, treats
     * every older step as "novel", and re-inserts the whole tail
     * every cycle. In the reporter's 4.2 GB / 6.8 GB failure,
     * 518,375 trace rows had shrunk to 80,583 distinct
     * `(episode_id, turn_id, user_text, agent_text, tool_calls_json)`
     * signatures — 84 % duplicates driven by exactly this loop.
     *
     * Rows are ordered by `ts ASC` so the causal chain matches the
     * order runLite / runReflect built.
     */
    listAllForEpisode(episodeId: EpisodeId | string): TraceRow[];
    /**
     * Narrow-projection episode fetch for capture-side dedup.
     *
     * Sibling to {@link listAllForEpisode}, but projects only the five
     * scalar dedup-identity columns
     * (`ts` / `turn_id` / `user_text` / `agent_text` / `tool_calls_json`)
     * and NEVER touches `vec_summary` / `vec_action`. That is the real
     * saving: on the reporter's DB in #2076 the two BLOB columns
     * dominated row size, so skipping them cuts per-row bytes by
     * ~1000× regardless of how many rows the episode contains.
     *
     * Uses `stmt.iterate()` internally to avoid better-sqlite3's
     * intermediate `.all()` allocation, but the result is still
     * materialised into a `TraceDedupRow[]` and returned to the
     * caller — this is not a streaming API. Peak JS memory therefore
     * scales linearly with row count × the small scalar payload,
     * which is what capture-side dedup actually needs.
     *
     * Every capture-side dedup call-site (`runLite`, `runLightweight`,
     * `persistRows` in `core/capture/capture.ts`) uses this helper
     * so no BLOBs load during the dedup pass.
     *
     * Same episode-scoping / `ts ASC` ordering contract as
     * `listAllForEpisode`.
     */
    listDedupRowsForEpisode(episodeId: EpisodeId | string): TraceDedupRow[];
    /**
     * Total row count matching the same filter (no limit/offset).
     * Used by list endpoints so the viewer can show "Page N of M".
     */
    count(filter?: Omit<TraceListFilter, "limit" | "offset">, visibility?: {
        sql: string;
        params: Record<string, unknown>;
    }): number;
    /**
     * Count distinct (episode_id, turn_id) groups — i.e. "memory turns",
     * where one user query + its tool sub-steps + final reply are
     * counted as 1. Used by the Memories viewer for accurate pagination.
     */
    countTurns(filter?: Omit<TraceListFilter, "limit" | "offset">, visibility?: {
        sql: string;
        params: Record<string, unknown>;
    }): number;
    /**
     * List paginated turn keys (episode_id, turn_id) ordered by the
     * turn's most recent trace timestamp DESC. The viewer uses this to
     * fetch a page of "memories" (1 turn = 1 memory).
     */
    listTurnKeys(filter?: TraceListFilter, visibility?: {
        sql: string;
        params: Record<string, unknown>;
    }): Array<{
        episodeId: string | null;
        turnId: number;
        maxTs: number;
    }>;
    /**
     * Fetch all traces belonging to the given (episodeId, turnId) pairs.
     * Returned rows are ordered by ts ascending so the frontend can
     * render the conversation in chronological order.
     */
    listByTurnKeys(keys: ReadonlyArray<{
        episodeId: string | null;
        turnId: number;
    }>): TraceRow[];
    /**
     * Vector top-K over `vec_summary` (or `vec_action` if `kind='action'`).
     * The caller passes any extra SQL filter (e.g. same-episode only).
     */
    searchByVector(query: EmbeddingVector, k: number, opts?: {
        kind?: "summary" | "action";
        where?: string;
        params?: Record<string, unknown>;
        hardCap?: number;
        /**
         * Tag-based pre-filter. Candidate row survives if ANY of its stored
         * tags appears in this list (`instr(tags_json, '"docker"') > 0`).
         * Pass empty or undefined to disable.
         */
        anyOfTags?: readonly string[];
    }): Array<VectorHit<string, TraceSearchMeta>>;
    /**
     * Convenience: in-memory top-K against pre-fetched rows (used when caller
     * has already filtered candidates by other criteria).
     */
    topKAgainstRows<TMeta>(query: EmbeddingVector, rows: VectorRow<TraceId, TMeta>[], k: number): Array<VectorHit<TraceId, TMeta>>;
    /**
     * Keyword channel — FTS5 trigram MATCH against `traces_fts`.
     *
     * Returns rank-ordered hits with the same `meta` shape as
     * `searchByVector` so the retrieval ranker can fuse channels via
     * RRF. We don't surface the raw FTS rank here — the caller scores
     * by reciprocal rank in `keyword.reciprocalRankScore`.
     */
    searchByText(ftsMatch: string, k: number, opts?: {
        where?: string;
        params?: Record<string, unknown>;
    }): Array<VectorHit<string, TraceSearchMeta>>;
    /**
     * Pattern channel — substring fallback for queries that fall below
     * the trigram tokenizer's window (e.g. 2-char Chinese names).
     *
     * Each term in `terms` is searched as `LIKE %term%` over the same
     * text columns the FTS index covers. Multiple terms are OR-ed.
     */
    searchByPattern(terms: readonly string[], k: number, opts?: {
        where?: string;
        params?: Record<string, unknown>;
    }): Array<VectorHit<string, TraceSearchMeta>>;
    /**
     * V7 §2.6 structural match — exact-substring lookup on stored error
     * signatures. Returns full `TraceRow` objects, newest first, capped
     * at `limit`. Case-sensitive (signatures are normalised verbatim).
     *
     * If the caller provides multiple `anyOfFragments`, rows that match
     * ANY fragment survive. Empty array returns `[]`.
     */
    searchByErrorSignature(anyOfFragments: readonly string[], limit: number, opts?: {
        where?: string;
        params?: Record<string, unknown>;
    }): TraceRow[];
    deleteById(id: TraceId): void;
    /**
     * Partial content patch applied by the viewer's "Edit" modal.
     * Only user-facing text fields are mutable — `ts`, `value`,
     * `alpha`, `priority`, and vectors are owned by the capture /
     * reward pipeline and must NOT be rewritten from the UI.
     */
    updateBody(id: TraceId, patch: {
        summary?: string | null;
        userText?: string;
        agentText?: string;
        tags?: readonly string[];
    }): void;
    updateVector(id: TraceId, field: "vecSummary" | "vecAction", vec: EmbeddingVector): boolean;
    /**
     * Fill in reflection + α for a trace that was previously written
     * in the "lite" capture phase (reflection=null, α=0). Invoked
     * at topic-end by the reflect-phase capture pass, which sees the
     * full causal chain and batch-scores every step of the episode
     * at once. Intentionally narrow: no other columns mutate.
     */
    updateReflection(id: TraceId, patch: {
        reflection: string | null;
        alpha: number;
    }): void;
    /**
     * Apply a share-state transition. `scope = null` un-shares. The
     * viewer calls this after (optionally) pushing the payload to
     * the Hub — so the pipeline only records local state, never
     * performs the network call itself.
     */
    updateShare(id: TraceId, share: {
        scope: ShareScope | null;
        target?: string | null;
        sharedAt?: number | null;
    }): void;
};
//# sourceMappingURL=traces.d.ts.map