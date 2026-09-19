/**
 * LLM-based relevance filter — post-processing step after `rank()`.
 *
 * Motivation (ported from legacy `memos-local-openclaw::unifiedLLMFilter`):
 * mechanical retrieval is greedy — any Python prompt pulls back every
 * Python-tagged trace even when the sub-problem doesn't match. A small
 * LLM call ("given this query, pick the truly relevant candidates")
 * removes most of the noise with a single round-trip.
 *
 * Design constraints:
 *   - One LLM call per turn, bounded output (index list + `sufficient`).
 *   - Totally opt-in: if the LLM is null, or the config flag is off,
 *     or the candidate list is empty, we pass through unchanged.
 *   - On ANY failure (network, schema, timeout) we fall back to a
 *     mechanical cutoff. A broken filter must never crash retrieval.
 *   - Returns both kept and dropped candidates so callers can log
 *     exactly what the LLM pruned (feeds the Logs page).
 *   - Rich candidate labels — we include role/time/tags/channels/score
 *     because openclaw's filter runs on those fields and loses precision
 *     without them.
 */
import type { LlmClient } from "../llm/index.js";
import type { Logger } from "../logger/types.js";
import type { RankedCandidate } from "./ranker.js";
import type { RetrievalConfig, RetrievalProfile } from "./types.js";
export interface FilterInput {
    query: string;
    ranked: readonly RankedCandidate[];
    profile?: RetrievalProfile;
    /**
     * Episode this retrieval is happening for (typically the active or
     * just-opening episode). Forwarded to the LLM call so the resulting
     * `system_model_status` audit row can be grouped with the rest of
     * that episode's pipeline activity in the Logs viewer.
     */
    episodeId?: string;
}
export interface FilterDeps {
    llm: LlmClient | null;
    log: Logger;
    timeoutMs?: number;
    deadlineAt?: number;
    signal?: AbortSignal;
    /** Override the LLM client's default malformed-JSON retry count. */
    malformedRetries?: number;
    config: Pick<RetrievalConfig, "llmFilterEnabled" | "llmFilterMaxKeep" | "llmFilterMinCandidates" | "llmFilterCandidateBodyChars">;
}
export interface FilterResult {
    kept: RankedCandidate[];
    dropped: RankedCandidate[];
    /**
     * Why the filter took this shape — surfaced so logs can show
     * "skipped: below threshold" vs "llm returned no selections".
     */
    outcome: "disabled" | "no_llm" | "below_threshold" | "empty_query" | "deferred_to_final" | "llm_kept_all" | "llm_filtered" | "llm_filtered_empty" | "llm_filtered_refilled" | "llm_failed_safe_cutoff";
    /**
     * The LLM's self-report on whether the *kept* candidates are enough
     * to answer `query`, or whether the caller should widen recall /
     * run a follow-up `memos_search`. `null` when the filter didn't
     * run (disabled / passthrough / failure paths).
     */
    sufficient: boolean | null;
}
export declare function llmFilterCandidates(input: FilterInput, deps: FilterDeps): Promise<FilterResult>;
//# sourceMappingURL=llm-filter.d.ts.map