/**
 * Tier 2 — trace + episode retrieval (V7 §2.6 §0.6).
 *
 * Two flavours of candidates come out of this tier:
 *
 *   1. *Trace-level* hits — single `traces` rows. Used when the agent
 *      needs a concrete "last time I did this, step-by-step" reminder.
 *   2. *Episode-level* roll-ups — best traces per `episode_id` collapse
 *      into one `EpisodeCandidate` per episode summarising the whole
 *      sub-task ("episode replay" in V7 prose).
 *
 * Channels (all run in parallel, fused via RRF in the ranker):
 *
 *   - vec_summary   — cosine over `traces.vec_summary` (state)
 *   - vec_action    — cosine over `traces.vec_action`  (action)
 *   - fts           — FTS5 trigram MATCH over user/agent/summary/reflection/tags
 *   - pattern       — LIKE %term% for queries below the trigram window
 *                     (e.g. 2-char Chinese names)
 *   - structural    — verbatim error-signature substring match
 *
 * Each channel contributes a `ChannelRank` to the candidate; the ranker
 * sums `1 / (k + rank)` across channels (RRF). Candidates that surface
 * in multiple channels get a strong lift — this is what plugs the
 * "single-channel false positive" hole that pure-cosine retrieval has.
 */
import type { EmbeddingVector, SessionId } from "../types.js";
import type { EpisodeCandidate, RetrievalConfig, RetrievalEmbedder, RetrievalProfile, RetrievalRepos, TraceCandidate } from "./types.js";
export interface Tier2Deps {
    repos: Pick<RetrievalRepos, "traces">;
    embedder?: RetrievalEmbedder;
    config: RetrievalConfig;
    now: () => number;
}
export interface Tier2Input {
    queryVec: EmbeddingVector | null;
    /** Optional tag hints — from `buildQuery`. Empty = no tag filtering. */
    tags: readonly string[];
    /**
     * V7 §2.6 structural-match fragments (verbatim error snippets). When
     * non-empty, we issue a dedicated `searchByErrorSignature` query and
     * blend the hits with the semantic candidates before ranking.
     */
    structuralFragments?: readonly string[];
    /** FTS5 MATCH expression (trigram channel). */
    ftsMatch?: string | null;
    /** Pattern terms (2-char ASCII / CJK bigrams). */
    patternTerms?: readonly string[];
    /** Full identifiers searched independently from generic pattern terms. */
    exactIdentifiers?: readonly string[];
    /** Whether `decision_repair` forced `includeLowValue`. */
    includeLowValue?: boolean;
    /**
     * The portion of the current durable session that the host model can
     * still see. Rows inside this window are filtered before channel Top-K;
     * rows older than `startTs` remain eligible after host compaction.
     *
     * `userTexts` is a bounded exact-text fallback for hosts whose visible
     * messages do not carry timestamps. It is intentionally not semantic:
     * embedding similarity belongs to MMR, not context-window dedupe.
     */
    visibleContext?: {
        sessionId: SessionId;
        startTs?: number;
        userTexts?: readonly string[];
    };
    /**
     * Legacy fallback for hosts that cannot report their visible context.
     * New adapters should send `visibleContext` instead.
     */
    excludeSessionId?: SessionId;
    /** Query-specific policy; personal facts use summary vectors first. */
    profile?: RetrievalProfile;
    /** Controlled second pass may add the action channel for personal facts. */
    includeActionVector?: boolean;
}
export interface Tier2Result {
    traces: TraceCandidate[];
    episodes: EpisodeCandidate[];
}
export declare function runTier2(deps: Tier2Deps, input: Tier2Input): Promise<Tier2Result>;
//# sourceMappingURL=tier2-trace.d.ts.map