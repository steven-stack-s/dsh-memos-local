/**
 * Ranker — fuses candidates across tiers and enforces diversity.
 *
 * Design (2026 overhaul, aligned with `memos-local-openclaw::recall/engine`):
 *
 *   1. **Base = best channel score.** A candidate's base evidence is the
 *      strongest single-channel hit it has — cosine for vector, `1/(rank+1)`
 *      for FTS / pattern, `0.9` synthetic for structural error-signature.
 *      This puts all channels on a comparable (0, 1] footing without the
 *      "cosine=0 for keyword hits" trap the old formula had.
 *
 *   2. **RRF bonus across channels.** Multi-channel matches add
 *      `rrfWeight · Σ 1/(k + rank_i + 1)`. A row confirmed by 2+ channels
 *      gets a clear lift over single-channel false-positives.
 *
 *   3. **Tier-specific additive boosts.** V·decay (Tier-2) and η
 *      (Tier-1) are add-ons that differentiate rows *within* the same
 *      base-score band — not a dominant term that washes out the RRF
 *      signal.
 *
 *   4. **Hard eligibility before destructive selection.** Long-identifier
 *      queries reject ordinary vector-only memories before dedupe/MMR while
 *      preserving the existing skill/world-model exemption.
 *
 *   5. **Two-stage repeated-question hard dedupe.** Before the threshold,
 *      exact duplicates collapse only within the same bypass-capability
 *      partition. After eligibility is resolved, surviving variants collapse
 *      again so duplicate text still consumes one Top-K slot.
 *
 *   6. **Strong multi-channel bypass.** Candidates surfaced through at least
 *      two channels, with one strong primary signal, may bypass the relative
 *      threshold but still participate normally in MMR.
 *
 *   7. **Smart-seed MMR.** Phase A seeds at most one candidate per tier,
 *      and only if its relevance is within `smartSeedRatio` of the pool
 *      top. Prevents "force-inject an irrelevant Tier-1 / Tier-3 just
 *      because the tier had a candidate".
 *
 * The module stays pure — no storage, no embedder, no side effects.
 */
import type { InjectionScoreDetails } from "../../agent-contract/dto.js";
import type { ChannelRank, EpisodeCandidate, ExperienceCandidate, RetrievalChannel, RetrievalConfig, RetrievalProfile, SkillCandidate, TierCandidate, TierKind, TraceCandidate, WorldModelCandidate } from "./types.js";
export interface RankerInput {
    tier1: readonly SkillCandidate[];
    tier2Traces: readonly TraceCandidate[];
    tier2Episodes: readonly EpisodeCandidate[];
    tier2Experiences?: readonly ExperienceCandidate[];
    tier3: readonly WorldModelCandidate[];
    /** Hard cap on total snippets after MMR. */
    limit: number;
    config: RetrievalConfig;
    now: number;
    profile?: RetrievalProfile;
    /** Concrete long identifiers requiring exact confirmation. */
    exactIdentifiers?: readonly string[];
}
export interface RankedCandidate {
    candidate: TierCandidate;
    /**
     * Base relevance used by MMR.
     *   relevance = bestChannelScore + rrfWeight · Σ 1/(k+rank+1)
     *             + priorityBoost (tier2)  + etaBoost (tier1)
     */
    relevance: number;
    /** Fused RRF score across channels (pre-weighting). */
    rrf: number;
    /** Final MMR-adjusted score. */
    score: number;
    /** `||vec||²`, cached for MMR. `null` means "no vec → treat as fully diverse". */
    normSq: number | null;
    /** True when this candidate was allowed past the threshold via the
     *  multi-channel bypass (useful for logs / "why did this survive?"). */
    bypassedThreshold?: boolean;
    /** Structured explanation copied into logs with the final snippet. */
    scoreDetails?: InjectionScoreDetails;
}
export interface RankerResult {
    ranked: RankedCandidate[];
    /** Count per tier *before* MMR. */
    tierSizes: Record<TierKind, number>;
    /** Count kept per tier after MMR. */
    kept: Record<TierKind, number>;
    /** Top relevance seen — useful for relative-threshold debugging. */
    topRelevance: number;
    /** Number of candidates the relative-threshold cut. */
    droppedByThreshold: number;
    /** Repeated-question trace candidates removed before MMR. */
    dedupedBeforeMmr: number;
    /** Subset of `dedupedBeforeMmr` removed after threshold eligibility. */
    dedupedAfterThreshold: number;
    /** Candidates rejected by long-identifier keyword confirmation. */
    droppedByKeywordConfirmation: number;
    /** Absolute floor applied (`topRelevance · floor`). */
    thresholdFloor: number;
    /** Channel hit counts aggregated across all candidates. */
    channelHits: Partial<Record<RetrievalChannel, number>>;
}
export declare function rank(input: RankerInput): RankerResult;
export type { ChannelRank };
//# sourceMappingURL=ranker.d.ts.map