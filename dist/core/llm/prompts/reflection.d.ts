import type { PromptDef } from "./index.js";
/**
 * V7 §3.2 — Reflection scorer.
 *
 * Given an L1 trace (state, action, outcome, reflection_text), return a
 * quality score α_t ∈ [0, 1] and a boolean `usable` flag. The facade parses
 * the JSON output; we validate structure at the call site.
 */
export declare const REFLECTION_SCORE_PROMPT: PromptDef;
/**
 * V7 §3.2 — *Batched* reflection synthesis + α scoring.
 *
 * One LLM call per episode instead of N synth + N α calls. The LLM sees the
 * complete causal chain (every step in order, including the final outcome),
 * which lets it write better-grounded reflections than per-step grounded
 * ones — V7 §3.2.3 axes "causal_insight" and "transferability" benefit
 * directly from the wider context window.
 *
 * Activated by `algorithm.capture.batchMode: "auto" | "per_episode"` in
 * `core/config`. The dispatcher in `core/capture/capture.ts` also enforces
 * `algorithm.capture.batchThreshold` so very long episodes degrade to the
 * per-step path instead of overflowing the prompt window.
 *
 * Output schema is documented inside the prompt — `core/capture/batch-scorer.ts`
 * validates each entry and falls back to per-step on any malformed value.
 */
export declare const BATCH_REFLECTION_PROMPT: PromptDef;
//# sourceMappingURL=reflection.d.ts.map