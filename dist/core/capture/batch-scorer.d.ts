/**
 * `batch-scorer` — episode-level reflection synthesis + α scoring in ONE
 * LLM call. Activated by `algorithm.capture.batchMode` + `batchThreshold`.
 *
 * Why this exists (V7 §3.2 batched variant):
 *
 *   The per-step path (`reflection-synth.ts` + `alpha-scorer.ts`) issues
 *   2 LLM calls per agent step (synth + α). For a 10-step episode that's
 *   ~20 calls — slow and expensive. This module folds them into one call
 *   that processes the whole episode at once.
 *
 *   Beyond cost: the LLM here sees the *complete* causal chain (every
 *   step in order, including the final outcome), so reflections it
 *   writes can credit-attribute across steps in a way grounded
 *   per-step reflections never can. V7 §3.2.3's `causal_insight` and
 *   `transferability` axes benefit directly.
 *
 * Trade-offs (encoded in capture.ts dispatch):
 *   - Prompt grows linearly with N steps. Each call is capped at
 *     `batchThreshold`; long episodes run as several bounded chunks.
 *   - One bad chunk forces a single batched retry for that chunk instead
 *     of N isolated retries — but the facade already does
 *     `malformedRetries` for us, and on hard failure capture.ts falls
 *     back to per-step for that chunk only.
 *
 * Wire format ↔ prompt:
 *   Send `{ host_context?, task_context?, steps: [{idx, state, action, outcome, reflection, synth_allowed}] }`.
 *   `task_context` is episode-level task summary (nullable string).
 *   Receive `{scores: [{idx, reflection_text, alpha, usable, reason}]}`.
 *   See `core/llm/prompts/reflection.ts :: BATCH_REFLECTION_PROMPT`.
 */
import type { LlmClient } from "../llm/index.js";
import type { NormalizedStep, ReflectionScore } from "./types.js";
export interface BatchScoreInput {
    step: NormalizedStep;
    /**
     * Reflection already extracted (adapter / regex). `null` when none — the
     * LLM may synthesize one if `synthReflections` is enabled.
     */
    existingReflection: string | null;
}
export interface BatchScoreOptions {
    /**
     * Mirror of `CaptureConfig.synthReflections`. When `false`, any reflection
     * the LLM writes for steps that came in empty is discarded
     * (text→null, α→0, source→none) — preserves the per-step contract.
     */
    synthReflections: boolean;
    episodeId?: string;
    phase?: string;
    taskSummary?: string | null;
    /**
     * Cap per-field text we shovel into the prompt. Default 1_200 chars per
     * `state`/`outcome`, 1_500 per `action`. Mirrors per-step prompts.
     */
    perFieldChars?: {
        state: number;
        action: number;
        outcome: number;
        reflection: number;
    };
}
export interface BatchScoreResult {
    /** Per-step `ReflectionScore`, one entry per input, in input order. */
    scores: ReflectionScore[];
    /** `servedBy` model id from the underlying LLM call. */
    model: string;
    /** Number of steps where we accepted a newly-synthesized reflection. */
    synthAccepted: number;
}
export declare const BATCH_OP_TAG: string;
/**
 * One LLM call → reflections + α for every input step.
 *
 * Throws `MemosError` with `LLM_OUTPUT_MALFORMED` when the LLM returns a
 * shape we cannot parse even after the facade's malformed-retry. Caller
 * (capture.ts) catches and falls back to per-step.
 *
 * Empty `inputs` → returns empty `scores` without invoking the LLM.
 */
export declare function batchScoreReflections(llm: LlmClient, inputs: ReadonlyArray<BatchScoreInput>, opts: BatchScoreOptions): Promise<BatchScoreResult>;
//# sourceMappingURL=batch-scorer.d.ts.map