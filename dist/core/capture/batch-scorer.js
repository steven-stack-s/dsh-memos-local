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
import { ERROR_CODES, MemosError } from "../../agent-contract/errors.js";
import { detectDominantLanguage, languageSteeringLine, } from "../llm/prompts/index.js";
import { BATCH_REFLECTION_PROMPT } from "../llm/prompts/reflection.js";
import { rootLogger } from "../logger/index.js";
import { sanitizeDerivedText } from "../safety/content.js";
const DEFAULT_FIELD_CHARS = {
    state: 1_200,
    action: 1_500,
    outcome: 600,
    reflection: 1_200,
    thinking: 1_500,
};
export const BATCH_OP_TAG = `capture.${BATCH_REFLECTION_PROMPT.id}.v${BATCH_REFLECTION_PROMPT.version}`;
/**
 * One LLM call → reflections + α for every input step.
 *
 * Throws `MemosError` with `LLM_OUTPUT_MALFORMED` when the LLM returns a
 * shape we cannot parse even after the facade's malformed-retry. Caller
 * (capture.ts) catches and falls back to per-step.
 *
 * Empty `inputs` → returns empty `scores` without invoking the LLM.
 */
export async function batchScoreReflections(llm, inputs, opts) {
    const log = rootLogger.child({ channel: "core.capture.batch" });
    if (inputs.length === 0) {
        return { scores: [], model: "none", synthAccepted: 0 };
    }
    const fieldChars = { ...DEFAULT_FIELD_CHARS, ...(opts.perFieldChars ?? {}) };
    const payload = {
        host_context: batchHostContext(inputs, llm),
        task_context: opts.taskSummary?.trim().slice(0, 1_200) || null,
        steps: inputs.map((input, i) => ({
            idx: i,
            state: clip(input.step.userText, fieldChars.state),
            thinking: clip(input.step.agentThinking ?? "", fieldChars.thinking),
            action: clip(input.step.agentText, fieldChars.action) || "(none)",
            tool_calls: input.step.toolCalls.map((t) => ({
                name: t.name,
                input: summarizeInput(t.input),
                output: clip(outputOf(t), 300),
                errorCode: t.errorCode ?? null,
            })),
            outcome: lastToolOutcome(input.step, fieldChars.outcome),
            reflection: clip(input.existingReflection ?? "", fieldChars.reflection),
            synth_allowed: opts.synthReflections,
        })),
    };
    // Reflections are first-person narrations — written in the same
    // language the user + agent were speaking so the Memories panel
    // stays coherent. Detect once per batch from the aggregate turn
    // texts; all steps in one episode share a language in practice.
    const reflectionLang = detectDominantLanguage(inputs.flatMap((i) => [
        i.step.userText,
        i.step.agentText,
        i.step.agentThinking,
        i.existingReflection,
    ]));
    const rsp = await llm.completeJson([
        { role: "system", content: BATCH_REFLECTION_PROMPT.system },
        { role: "system", content: languageSteeringLine(reflectionLang) },
        { role: "user", content: JSON.stringify(payload) },
    ], {
        op: BATCH_OP_TAG,
        episodeId: opts.episodeId,
        phase: opts.phase,
        schemaHint: '{"scores": [{"idx": int, "reflection_text": "str", "alpha": 0..1, "usable": bool, "reason": "str"}]}',
        validate: (v) => validateBatchPayload(v, inputs.length),
        malformedRetries: 1,
        temperature: 0,
        maxTokens: batchMaxTokens(inputs.length),
    });
    // Index entries by `idx` so a re-ordered (but otherwise valid) response
    // still maps back to the right step.
    const byIdx = new Map();
    for (const entry of rsp.value.scores)
        byIdx.set(Number(entry.idx), entry);
    let synthAccepted = 0;
    const scores = inputs.map((input, i) => {
        const raw = byIdx.get(i);
        if (!raw) {
            // Should be impossible after validateBatchPayload, but degrade
            // safely: treat as no-reflection.
            return disabledScoreFor(input);
        }
        const incomingText = (input.existingReflection ?? "").trim();
        const llmText = typeof raw.reflection_text === "string" ? sanitizeDerivedText(raw.reflection_text) : "";
        const usable = Boolean(raw.usable);
        const rawAlpha = clamp01(numOrZero(raw.alpha));
        const alpha = usable ? rawAlpha : 0;
        const reason = typeof raw.reason === "string" ? sanitizeDerivedText(raw.reason) : null;
        let finalText;
        let source;
        if (incomingText.length > 0) {
            // Caller already had a reflection; never let the LLM rewrite it
            // (the prompt asks for verbatim copy, but we double-enforce here).
            finalText = incomingText.slice(0, 1_500);
            source = sourceForExisting(input);
        }
        else if (llmText.length > 0 && opts.synthReflections) {
            finalText = llmText.slice(0, 1_500);
            source = "synth";
            synthAccepted += 1;
        }
        else {
            // Either the LLM didn't write one (incoherent step) or synth is
            // disabled and we discard whatever it wrote.
            return disabledScoreFor(input);
        }
        return {
            text: finalText,
            alpha,
            usable: usable && finalText !== null,
            reason,
            source,
            model: rsp.servedBy,
        };
    });
    log.debug("batch.scored", {
        steps: inputs.length,
        synthAccepted,
        model: rsp.servedBy,
        durationMs: rsp.durationMs,
    });
    return { scores, model: rsp.servedBy, synthAccepted };
}
// ─── helpers ────────────────────────────────────────────────────────────────
function batchHostContext(inputs, llm) {
    const hints = inputs
        .map((input) => input.step.meta.contextHints)
        .find((value) => typeof value === "object" && value !== null && !Array.isArray(value));
    const out = {
        reflectionProvider: llm.provider,
        reflectionModel: llm.model,
    };
    for (const key of ["agentIdentity", "hostProvider", "hostModel", "hostApiMode", "hostBaseUrl"]) {
        const value = hints?.[key];
        if (typeof value === "string" && value.trim())
            out[key] = value.trim();
    }
    return out;
}
function disabledScoreFor(input) {
    const text = (input.existingReflection ?? "").trim();
    if (text.length === 0) {
        return { text: null, alpha: 0, usable: false, source: "none" };
    }
    // We had a reflection but the LLM result was unusable — keep the text,
    // attribute α=0.5 the same way `disabledScore` does for non-LLM paths so
    // backprop still has a non-zero weight.
    return {
        text: text.slice(0, 1_500),
        alpha: 0.5,
        usable: true,
        source: sourceForExisting(input),
    };
}
function sourceForExisting(input) {
    return input.step.rawReflection !== null && input.step.rawReflection.trim().length > 0
        ? "adapter"
        : "extracted";
}
function validateBatchPayload(v, expected) {
    const o = v;
    if (!o || !Array.isArray(o.scores)) {
        throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "batch reflection: scores array missing", { got: typeof o });
    }
    if (o.scores.length !== expected) {
        throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "batch reflection: scores length mismatch", { expected, got: o.scores.length });
    }
    for (const entry of o.scores) {
        if (typeof entry !== "object" || entry === null) {
            throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "batch reflection: non-object entry");
        }
        if (typeof entry.idx !== "number") {
            throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "batch reflection: idx must be number", {
                got: entry.idx,
            });
        }
        if (typeof entry.alpha !== "number") {
            throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "batch reflection: alpha must be number", {
                idx: entry.idx,
                got: entry.alpha,
            });
        }
        if (typeof entry.usable !== "boolean") {
            throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "batch reflection: usable must be boolean", {
                idx: entry.idx,
                got: entry.usable,
            });
        }
        if (entry.reflection_text != null && typeof entry.reflection_text !== "string") {
            throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "batch reflection: reflection_text must be string when present", { idx: entry.idx, got: typeof entry.reflection_text });
        }
    }
}
function batchMaxTokens(stepCount) {
    // Batch output scales with step count; keep a per-step budget but cap below
    // the 16k range that triggered avoidable reasoning spend on mimo replay.
    const perStepOutputBudget = 512;
    const baseBudget = 768;
    const ceiling = 8_192;
    return Math.min(ceiling, baseBudget + Math.max(1, stepCount) * perStepOutputBudget);
}
function lastToolOutcome(step, max) {
    const last = step.toolCalls[step.toolCalls.length - 1];
    if (!last)
        return "(assistant-only step)";
    const head = last.errorCode ? `ERROR[${last.errorCode}] ` : "";
    return clip(head + outputOf(last), max);
}
function outputOf(t) {
    if (t.output === undefined || t.output === null)
        return "";
    if (typeof t.output === "string")
        return t.output;
    try {
        return JSON.stringify(t.output);
    }
    catch {
        return String(t.output);
    }
}
function summarizeInput(v) {
    if (v === undefined || v === null)
        return "";
    if (typeof v === "string")
        return v.slice(0, 200);
    try {
        return JSON.stringify(v).slice(0, 200);
    }
    catch {
        return String(v).slice(0, 200);
    }
}
function clip(s, n) {
    if (!s)
        return "";
    return s.length > n ? s.slice(0, n) + "…" : s;
}
function clamp01(v) {
    if (!Number.isFinite(v))
        return 0;
    return Math.max(0, Math.min(1, v));
}
function numOrZero(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
//# sourceMappingURL=batch-scorer.js.map