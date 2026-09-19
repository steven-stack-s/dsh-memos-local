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
import { ERROR_CODES, MemosError } from "../../agent-contract/errors.js";
import { detectDominantLanguage, languageSteeringLine, } from "../llm/prompts/index.js";
import { REFLECTION_SCORE_PROMPT } from "../llm/prompts/reflection.js";
import { rootLogger } from "../logger/index.js";
import { sanitizeDerivedText } from "../safety/content.js";
export async function scoreReflection(llm, input) {
    const log = rootLogger.child({ channel: "core.capture.alpha" });
    const thinking = (input.step.agentThinking ?? "").trim();
    const userPayload = [
        `TASK CONTEXT:`,
        input.taskSummary?.trim().slice(0, 1_200) || "(none)",
        ``,
        `STATE:`,
        input.step.userText.slice(0, 1_200) || "(none)",
        ``,
        `THINKING:`,
        thinking ? thinking.slice(0, 1_500) : "(none — model did not emit thinking this step)",
        ``,
        `ACTION:`,
        input.step.agentText.slice(0, 1_500) || "(none)",
        input.step.toolCalls.length > 0
            ? `\nTOOL_CALLS:\n${input.step.toolCalls
                .map((t) => t.errorCode
                ? `- ${t.name}(${summarizeInput(t.input)}) → ERROR[${t.errorCode}] ${truncate(outputOf(t), 300)}`
                : `- ${t.name}(${summarizeInput(t.input)}) → ${truncate(outputOf(t), 300)}`)
                .join("\n")}`
            : "\nTOOL_CALLS: (none)",
        ``,
        `OUTCOME:`,
        // Use the last 1 tool output as the "outcome" signal if present.
        lastToolOutcome(input.step, input.outcomeMaxChars ?? 600),
        ``,
        `DOWNSTREAM STEP PREVIEW:`,
        formatDownstreamPreview(input),
        ``,
        `REFLECTION:`,
        input.reflectionText.slice(0, 1_500),
    ]
        .filter(Boolean)
        .join("\n");
    // Match the `reason` string's language to the step's own language so
    // the Memories viewer doesn't mix 中文 + English per row.
    const stepLang = detectDominantLanguage([
        input.step.userText,
        input.step.agentText,
        input.step.agentThinking,
        input.reflectionText,
    ]);
    const rsp = await llm.completeJson([
        { role: "system", content: REFLECTION_SCORE_PROMPT.system },
        { role: "system", content: languageSteeringLine(stepLang) },
        { role: "user", content: userPayload },
    ], {
        op: `capture.alpha.${REFLECTION_SCORE_PROMPT.id}.v${REFLECTION_SCORE_PROMPT.version}`,
        episodeId: input.episodeId,
        phase: input.phase,
        schemaHint: `{"alpha": 0..1, "usable": true|false, "reason": "short string"}`,
        validate: (v) => {
            const o = v;
            if (typeof o.alpha !== "number") {
                throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "alpha must be number", {
                    got: o.alpha,
                });
            }
            if (typeof o.usable !== "boolean") {
                throw new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "usable must be boolean", {
                    got: o.usable,
                });
            }
        },
        malformedRetries: 1,
        temperature: 0,
    });
    const rawAlpha = rsp.value.alpha;
    const usable = Boolean(rsp.value.usable);
    const alpha = clamp01(rawAlpha);
    const finalAlpha = usable ? alpha : 0;
    const reason = typeof rsp.value.reason === "string" ? sanitizeDerivedText(rsp.value.reason) : null;
    log.debug("alpha.scored", {
        key: input.step.key,
        alpha: finalAlpha,
        usable,
        rawAlpha,
        model: rsp.servedBy,
        reason,
    });
    return { alpha: finalAlpha, usable, reason, model: rsp.servedBy };
}
export function disabledScore(text, source) {
    return {
        text,
        alpha: text ? 0.5 : 0,
        usable: text !== null,
        source,
    };
}
function clamp01(v) {
    if (!Number.isFinite(v))
        return 0;
    return Math.max(0, Math.min(1, v));
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
function lastToolOutcome(step, maxChars) {
    const last = step.toolCalls[step.toolCalls.length - 1];
    if (!last)
        return "(assistant-only step)";
    return (last.errorCode ? `ERROR[${last.errorCode}] ` : "") + truncate(outputOf(last), maxChars);
}
function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + "..." : s;
}
function formatDownstreamPreview(input) {
    const preview = input.downstream ?? [];
    if (preview.length === 0)
        return "(none)";
    return preview
        .map((item) => {
        const label = `step+${item.offset}`;
        if (item.kind === "tooluse") {
            const lines = [
                `[${label}] type=tooluse`,
                `tool_names: ${item.toolNames?.join(", ") || "(unknown)"}`,
                `tool_output: ${item.toolOutput?.trim() || "(none)"}`,
            ];
            if (item.reflection?.trim()) {
                lines.push(`existing_reflection: ${item.reflection.trim()}`);
            }
            return lines.join("\n");
        }
        return [`[${label}] type=text`, item.text?.trim() || "(empty)"].join("\n");
    })
        .join("\n\n");
}
//# sourceMappingURL=alpha-scorer.js.map