/**
 * Gathers supporting L1 traces for a crystallization candidate.
 *
 * Strategy (V7 §2.3 / §2.5.1):
 *   1. Take the policy's `sourceEpisodeIds` as the canonical evidence cone.
 *   2. For each episode, pull its traces and score them by `value` (V).
 *   3. Apply a blended cosine score against the policy vector — high-V
 *      traces that are also semantically aligned with the policy are the
 *      strongest evidence.
 *   4. Return the top `evidenceLimit` traces, char-capped, sorted by score.
 *
 * This module does **not** call the LLM. It's a pure read-side helper over
 * the storage repos, so it's cheap to run on every reward tick.
 */
import type { EpisodeId, PolicyRow, TraceRow } from "../types.js";
import type { Repos } from "../storage/repos/index.js";
import type { SkillConfig } from "./types.js";
export interface EvidenceResult {
    traces: TraceRow[];
    episodeIds: EpisodeId[];
    /** Median V across the kept traces — used for logging only. */
    medianValue: number;
}
export interface EvidenceDeps {
    repos: Pick<Repos, "traces">;
    config: Pick<SkillConfig, "evidenceLimit" | "traceCharCap">;
}
export declare function gatherEvidence(policy: PolicyRow, deps: EvidenceDeps): EvidenceResult;
//# sourceMappingURL=evidence.d.ts.map