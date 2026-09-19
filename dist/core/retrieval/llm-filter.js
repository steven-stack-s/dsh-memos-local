/**
 * LLM-based relevance filter — post-processing step after `rank()`.
 *
 * Motivation (ported from legacy `memos-local-openclaw::unifiedLLMFilter`):
 * mechanical retrieval is greedy — any Python prompt pulls back every
 * Python-tagged trace even when the sub-problem doesn't match. A small
 * LLM call ("given this query, pick the truly relevant candidates")
 * removes most of the noise with a single round-trip.
 *
 * Design constraints:
 *   - One LLM call per turn, bounded output (index list + `sufficient`).
 *   - Totally opt-in: if the LLM is null, or the config flag is off,
 *     or the candidate list is empty, we pass through unchanged.
 *   - On ANY failure (network, schema, timeout) we fall back to a
 *     mechanical cutoff. A broken filter must never crash retrieval.
 *   - Returns both kept and dropped candidates so callers can log
 *     exactly what the LLM pruned (feeds the Logs page).
 *   - Rich candidate labels — we include role/time/tags/channels/score
 *     because openclaw's filter runs on those fields and loses precision
 *     without them.
 */
import { RETRIEVAL_FILTER_PROMPT } from "../llm/prompts/index.js";
const DEFAULT_CANDIDATE_BODY_CHARS = 500;
const MIN_FILTER_OUTPUT_TOKENS = 160;
const MAX_FILTER_OUTPUT_TOKENS = 2048;
export async function llmFilterCandidates(input, deps) {
    const { ranked, query } = input;
    if (!deps.config.llmFilterEnabled) {
        return passthrough(ranked, "disabled");
    }
    // `llmFilterMinCandidates` is the *minimum* list length required to
    // RUN the filter. Default is 1, meaning even a single candidate gets
    // a precision pass — openclaw behaviour, and matches the user
    // reports that "a single off-topic memory sneaks through when the
    // filter skips the check".
    if (ranked.length < deps.config.llmFilterMinCandidates) {
        return passthrough(ranked, "below_threshold");
    }
    if (ranked.length === 0) {
        return passthrough(ranked, "below_threshold");
    }
    if (!query || !query.trim()) {
        return passthrough(ranked, "empty_query");
    }
    if (!deps.llm) {
        return passthrough(ranked, "no_llm");
    }
    if (deps.signal?.aborted) {
        deps.log.debug("llm_filter.deadline_exceeded", { candidateCount: ranked.length });
        return safeCutoff(ranked, deps);
    }
    const bodyChars = deps.config.llmFilterCandidateBodyChars ?? DEFAULT_CANDIDATE_BODY_CHARS;
    const items = ranked.map((r, i) => ({
        index: i,
        label: describeCandidate(r, bodyChars),
    }));
    const list = items.map((x) => `${x.index + 1}. ${x.label}`).join("\n");
    try {
        const completion = deps.llm.completeJson([
            { role: "system", content: RETRIEVAL_FILTER_PROMPT.system },
            {
                role: "user",
                content: `QUERY: ${query.slice(0, 500)}

CANDIDATES:
${list}`,
            },
        ], {
            op: `retrieval.${RETRIEVAL_FILTER_PROMPT.id}.v${RETRIEVAL_FILTER_PROMPT.version}`,
            phase: "retrieve",
            episodeId: input.episodeId,
            temperature: 0,
            timeoutMs: deps.timeoutMs,
            deadlineAt: deps.deadlineAt,
            signal: deps.signal,
            // Output is only ordered indices + one bool, but the list can
            // legitimately be as long as the ranked candidates.
            maxTokens: filterOutputTokenBudget(ranked.length),
            malformedRetries: deps.malformedRetries ?? 1,
        });
        const rsp = deps.deadlineAt === undefined
            ? await completion
            : await waitForFilterDeadline(completion, deps);
        const raw = (rsp.value?.ranked ?? rsp.value?.selected ?? []);
        const sufficient = coerceBool(rsp.value?.sufficient);
        if (!Array.isArray(raw)) {
            deps.log.debug("llm_filter.malformed", { got: typeof raw });
            return safeCutoff(ranked, deps);
        }
        const orderedIndices = [];
        const seenIndices = new Set();
        for (const v of raw) {
            const n = typeof v === "number" ? v : Number(v);
            if (!Number.isFinite(n))
                continue;
            const zero = Math.floor(n) - 1;
            if (zero < 0 || zero >= ranked.length)
                continue;
            if (seenIndices.has(zero))
                continue;
            seenIndices.add(zero);
            orderedIndices.push(zero);
        }
        const cappedIndices = orderedIndices.slice(0, Math.max(0, deps.config.llmFilterMaxKeep));
        const keepIndices = new Set(cappedIndices);
        if (keepIndices.size === 0) {
            return {
                kept: [],
                dropped: [...ranked],
                outcome: "llm_filtered_empty",
                sufficient: sufficient ?? false,
            };
        }
        const kept = cappedIndices.map((i) => ranked[i]);
        const keptSet = new Set(kept);
        const dropped = ranked.filter((candidate) => !keptSet.has(candidate));
        return {
            kept,
            dropped,
            outcome: kept.length === ranked.length ? "llm_kept_all" : "llm_filtered",
            sufficient,
        };
    }
    catch (err) {
        deps.log.warn("llm_filter.failed", {
            err: err instanceof Error ? err.message : String(err),
            candidateCount: ranked.length,
        });
        return safeCutoff(ranked, deps);
    }
}
async function waitForFilterDeadline(operation, deps) {
    const remainingMs = Math.max(0, (deps.deadlineAt ?? Date.now()) - Date.now());
    const timeoutMs = Math.max(0, Math.min(remainingMs, deps.timeoutMs ?? remainingMs));
    if (deps.signal?.aborted) {
        throw deps.signal.reason ?? new DOMException("retrieval deadline exceeded", "TimeoutError");
    }
    let timer;
    let onAbort;
    const cutoff = new Promise((_resolve, reject) => {
        const finish = (error) => {
            if (timer !== undefined)
                clearTimeout(timer);
            deps.signal?.removeEventListener("abort", onAbort);
            reject(error);
        };
        onAbort = () => finish(deps.signal?.reason ?? new DOMException("retrieval deadline exceeded", "TimeoutError"));
        deps.signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => finish(new DOMException("retrieval filter deadline exceeded", "TimeoutError")), timeoutMs);
    });
    try {
        return await Promise.race([operation, cutoff]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        if (onAbort)
            deps.signal?.removeEventListener("abort", onAbort);
    }
}
function filterOutputTokenBudget(candidateCount) {
    return Math.min(MAX_FILTER_OUTPUT_TOKENS, Math.max(MIN_FILTER_OUTPUT_TOKENS, candidateCount * 8 + 80));
}
function passthrough(ranked, outcome) {
    return { kept: [...ranked], dropped: [], outcome, sufficient: null };
}
/**
 * Mechanical fail-closed: when the LLM is unavailable / errored,
 * apply a relative-relevance cutoff so we don't dump the entire ranked
 * list into the prompt. Keeps:
 *   1. items whose score ≥ `topScore · 0.7`
 *   2. capped at `llmFilterMaxKeep` so the prompt stays small.
 *
 * The ranker already applied an initial cutoff with the same family of
 * floors, but the LLM is expected to prune further (because the
 * ranker is tuned for recall). This fallback uses a slightly tighter
 * ratio so the "fail" path doesn't ship as much noise as the success
 * path.
 */
function safeCutoff(ranked, deps) {
    if (ranked.length === 0) {
        return {
            kept: [],
            dropped: [],
            outcome: "llm_failed_safe_cutoff",
            sufficient: null,
        };
    }
    const ratio = 0.7;
    const topScore = ranked.reduce((m, c) => Math.max(m, c.score ?? c.relevance), 0);
    const cutoff = topScore > 0 ? topScore * ratio : 0;
    const keepCap = Math.max(0, deps.config.llmFilterMaxKeep);
    if (keepCap === 0) {
        return {
            kept: [],
            dropped: [...ranked],
            outcome: "llm_failed_safe_cutoff",
            sufficient: null,
        };
    }
    const kept = [];
    const dropped = [];
    for (const c of ranked) {
        const s = c.score ?? c.relevance;
        if (s >= cutoff && kept.length < keepCap)
            kept.push(c);
        else
            dropped.push(c);
    }
    // If the cutoff would have dropped everything, keep the single best
    // candidate so the agent at least sees one option.
    if (kept.length === 0 && ranked.length > 0) {
        kept.push(ranked[0]);
        dropped.shift();
    }
    return {
        kept,
        dropped,
        outcome: "llm_failed_safe_cutoff",
        sufficient: null,
    };
}
function coerceBool(v) {
    if (typeof v === "boolean")
        return v;
    if (v === "true" || v === "yes" || v === 1)
        return true;
    if (v === "false" || v === "no" || v === 0)
        return false;
    return null;
}
/**
 * Render a ranked candidate into a single labelled string for the LLM.
 * Keep this intentionally content-focused: the filter should judge the
 * candidate's semantic usefulness, not anchor on retrieval internals like
 * timestamps, channels, tags, or ranker scores.
 */
function describeCandidate(r, bodyChars) {
    const c = r.candidate;
    switch (c.tier) {
        case "tier1": {
            const skill = c;
            const head = skill.skillName ?? "(skill)";
            const hint = squashBody(skill.invocationGuide ?? "", bodyChars);
            return `[SKILL] ${head}${hint ? `\n   ${hint}` : ""}`;
        }
        case "tier2": {
            if (c.refKind === "trace") {
                const tr = c;
                const parts = [];
                if (tr.summary?.trim())
                    parts.push(tr.summary.trim());
                if (tr.userText?.trim())
                    parts.push(`[user] ${tr.userText.trim()}`);
                if (tr.agentText?.trim())
                    parts.push(`[assistant] ${tr.agentText.trim()}`);
                if (tr.reflection?.trim())
                    parts.push(`[note] ${tr.reflection.trim()}`);
                const body = squashBody(parts.join(" "), bodyChars);
                return `[TRACE] ${body}`;
            }
            if (c.refKind === "experience") {
                const ex = c;
                const parts = [
                    ex.title,
                    ex.experienceType ? `type=${ex.experienceType}` : null,
                    ex.evidencePolarity ? `evidence=${ex.evidencePolarity}` : null,
                    ex.trigger,
                    ex.procedure,
                    ex.verification,
                ].filter(Boolean).join(" ");
                const body = squashBody(parts, bodyChars);
                return `[EXPERIENCE] ${body}`;
            }
            const ep = c;
            const body = squashBody(ep.summary ?? "", bodyChars);
            return `[EPISODE] ${body}`;
        }
        case "tier3": {
            const wm = c;
            const head = wm.title ?? "(world-model)";
            const body = squashBody(wm.body ?? "", bodyChars);
            return `[WORLD-MODEL] ${head}${body ? `\n   ${body}` : ""}`;
        }
        default:
            return "[UNKNOWN]";
    }
}
function squashBody(s, max) {
    const cleaned = s.replace(/\s+/g, " ").trim();
    if (cleaned.length <= max)
        return cleaned;
    return cleaned.slice(0, Math.max(0, max - 1)) + "…";
}
//# sourceMappingURL=llm-filter.js.map