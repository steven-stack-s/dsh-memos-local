/**
 * V7 §2.5.2 — LLM-driven skill crystallization.
 *
 * Given a policy + its evidence, we call `SKILL_CRYSTALLIZE_PROMPT` to
 * produce a structured draft. The draft is normalised / clamped to avoid
 * surprising the packager if the LLM emits missing or weird fields.
 *
 * We never call the LLM without evidence — if the caller hands us zero
 * traces we fail fast with `skipped_reason="no-evidence"`.
 */
import type { LlmClient } from "../llm/types.js";
import type { Logger } from "../logger/types.js";
import type { EpisodeId, PolicyRow, TraceRow } from "../types.js";
import type { SkillModelRefusalDetails, SkillConfig, SkillCrystallizationDraft } from "./types.js";
export interface CrystallizeInput {
    policy: PolicyRow;
    evidence: TraceRow[];
    /**
     * Optional negative evidence: traces from the same context that scored
     * V < 0. Surfaced to the LLM as `counter_examples` so it can write
     * concrete `decision_guidance.anti_pattern` lines (V7 §2.4.6 step ⑤
     * "对比 V 分布生成动作偏好"). Caller decides how to mine these — see
     * `core/skill/skill.ts` for the live wiring.
     */
    counterExamples?: TraceRow[];
    /** Names of *non-archived* skills, so the LLM can avoid collisions. */
    namingSpace: string[];
    /**
     * Episode that triggered this crystallization, when known. Forwarded
     * to the LLM call so the resulting `system_model_status` audit row
     * can be grouped with the rest of that episode's pipeline activity in
     * the Logs viewer.
     */
    episodeId?: EpisodeId;
}
export interface CrystallizeDeps {
    llm: LlmClient | null;
    log: Logger;
    config: SkillConfig;
    /** Optional structural validator, allows tests to inject extra rules. */
    validate?: (draft: SkillCrystallizationDraft) => void;
}
export type CrystallizeResult = {
    ok: true;
    draft: SkillCrystallizationDraft;
} | {
    ok: false;
    skippedReason: string;
    modelRefusal?: SkillModelRefusalDetails;
};
/**
 * Run one crystallization call and return a normalised draft.
 */
export declare function crystallizeDraft(input: CrystallizeInput, deps: CrystallizeDeps): Promise<CrystallizeResult>;
/**
 * A sensible default validator used both in production and in tests. Summary
 * can be recovered from the draft itself, but steps must already contain
 * actionable material. The runtime normaliser may ground missing steps in the
 * source policy; this validator never invents a generic procedure.
 */
export declare function defaultDraftValidator(draft: SkillCrystallizationDraft): void;
//# sourceMappingURL=crystallize.d.ts.map