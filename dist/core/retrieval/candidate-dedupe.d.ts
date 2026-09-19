/**
 * High-confidence retrieval-candidate dedupe for repeated trace questions.
 *
 * This stage is intentionally deterministic and embedding-free. It runs after
 * relevance/RRF scoring but before the relative threshold and MMR, so duplicate
 * high scores cannot inflate the cutoff and removed rows release Top-K slots.
 */
import type { RankedCandidate } from "./ranker.js";
export interface CandidateDedupeResult {
    kept: RankedCandidate[];
    dropped: RankedCandidate[];
}
export interface CandidateDedupeOptions {
    /**
     * Optional hard-eligibility partition. Candidates with identical content but
     * different downstream capabilities remain separate until that capability
     * has been evaluated (for example, relative-threshold bypass).
     */
    capabilityKey?: (candidate: RankedCandidate) => string;
}
/**
 * Hard-delete only two high-confidence duplicate shapes:
 *   1. explicit short acknowledgements when the same question also has
 *      evidence-bearing candidates;
 *   2. candidates whose normalised summary/reflection/non-ack answer evidence
 *      is identical.
 *
 * Distinct evidence — including concise answers such as "苹果" and "芒果" —
 * remains separate so updates and contradictions still reach MMR and the later
 * LLM relevance filter.
 */
export declare function dedupeRepeatedQuestionCandidates(ranked: readonly RankedCandidate[], options?: CandidateDedupeOptions): CandidateDedupeResult;
//# sourceMappingURL=candidate-dedupe.d.ts.map