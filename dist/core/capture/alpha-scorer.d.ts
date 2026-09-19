/**
 * `alpha-scorer` — grade a reflection with the `REFLECTION_SCORE_PROMPT`
 * (defined in `core/llm/prompts/reflection.ts`).
 *
 * Implements V7 eq. 5:
 *    α_t = judge(state_t, action_t, outcome_t, reflection_t)
 *    usable = α ≥ 0.4 ∧ non-tautological
 *    if ¬usable then α ← 0
 *
 * We parse a `{alpha: number, usable: boolean, reason?: string}` JSON
 * response, clamp α to [0, 1], and force α = 0 when `usable=false`.
 *
 * Failures (LLM unavailable, malformed JSON) return a neutral
 * `{alpha: null, usable: false}` — the caller decides what to do
 * (capture.ts falls back to α=0 so nothing is trained on ungraded data).
 */
import type { LlmClient } from "../llm/index.js";
import type { NormalizedStep, ReflectionContext, ReflectionScore } from "./types.js";
export interface AlphaInput extends ReflectionContext {
    step: NormalizedStep;
    reflectionText: string;
    episodeId?: string;
    phase?: string;
    outcomeMaxChars?: number;
}
export interface AlphaOutput {
    alpha: number;
    usable: boolean;
    reason: string | null;
    model: string;
}
export declare function scoreReflection(llm: LlmClient, input: AlphaInput): Promise<AlphaOutput>;
export declare function disabledScore(text: string | null, source: ReflectionScore["source"]): ReflectionScore;
//# sourceMappingURL=alpha-scorer.d.ts.map