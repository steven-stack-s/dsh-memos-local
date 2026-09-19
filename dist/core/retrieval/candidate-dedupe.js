/**
 * High-confidence retrieval-candidate dedupe for repeated trace questions.
 *
 * This stage is intentionally deterministic and embedding-free. It runs after
 * relevance/RRF scoring but before the relative threshold and MMR, so duplicate
 * high scores cannot inflate the cutoff and removed rows release Top-K slots.
 */
const SHORT_ACK_PATTERNS = [
    /^(ok|okay|sure|got it|noted|understood|alright|will do|copy|copy that|thanks|thank you|✓|✅|👍)[\s.!]*$/i,
    /^(记住了|已记住|已经记住|好的|明白|收到|了解|谢谢)[\s。!]*$/,
];
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
export function dedupeRepeatedQuestionCandidates(ranked, options = {}) {
    const groups = new Map();
    const ungrouped = [];
    for (const candidate of ranked) {
        if (candidate.candidate.refKind !== "trace") {
            ungrouped.push(candidate);
            continue;
        }
        const trace = candidate.candidate;
        const key = normalizeForDedupe(trace.userText ?? "");
        if (!key) {
            ungrouped.push(candidate);
            continue;
        }
        const group = groups.get(key) ?? [];
        group.push(candidate);
        groups.set(key, group);
    }
    const selected = new Set(ungrouped);
    for (const group of groups.values()) {
        const evidenceBearing = group.filter((candidate) => !isScaffoldingOnly(candidate));
        const eligible = evidenceBearing.length > 0 ? evidenceBearing : group;
        const bestByEvidence = new Map();
        for (const candidate of eligible) {
            const evidenceSignature = evidenceBearing.length > 0
                ? candidateEvidenceSignature(candidate)
                : "__scaffolding__";
            const signature = [
                evidenceSignature,
                options.capabilityKey?.(candidate) ?? "",
            ].join("\u0000");
            const current = bestByEvidence.get(signature);
            if (!current || isMoreRelevant(candidate, current)) {
                bestByEvidence.set(signature, candidate);
            }
        }
        for (const candidate of bestByEvidence.values())
            selected.add(candidate);
    }
    return {
        kept: ranked.filter((candidate) => selected.has(candidate)),
        dropped: ranked.filter((candidate) => !selected.has(candidate)),
    };
}
function isScaffoldingOnly(ranked) {
    const trace = ranked.candidate;
    if ((trace.summary?.trim().length ?? 0) > 0)
        return false;
    if ((trace.reflection?.trim().length ?? 0) > 0)
        return false;
    const agent = trace.agentText?.trim() ?? "";
    return agent.length === 0 || isShortAck(agent);
}
function candidateEvidenceSignature(ranked) {
    const trace = ranked.candidate;
    const agent = trace.agentText?.trim() ?? "";
    return [
        normalizeForDedupe(trace.summary?.trim() ?? ""),
        normalizeForDedupe(trace.reflection?.trim() ?? ""),
        isShortAck(agent) ? "" : normalizeForDedupe(agent),
    ].join("\u0000");
}
function isMoreRelevant(candidate, current) {
    if (candidate.relevance !== current.relevance) {
        return candidate.relevance > current.relevance;
    }
    return candidate.rrf > current.rrf;
}
function normalizeForDedupe(text) {
    return text
        .normalize("NFKC")
        .toLowerCase()
        .trim()
        .replace(/\s+/gu, " ")
        .replace(/[.!?。！？]+$/gu, "")
        .trim();
}
function isShortAck(text) {
    return SHORT_ACK_PATTERNS.some((pattern) => pattern.test(text));
}
//# sourceMappingURL=candidate-dedupe.js.map