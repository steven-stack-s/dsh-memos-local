/**
 * `InjectionPacket.snippets` is already post-LLM-filter. Reconstruct the
 * Logs-page funnel from the kept and explicitly surfaced dropped snippets
 * instead of trying to remove dropped ids from an already-filtered list.
 * The LLM may reorder its kept subset, so restore the mechanical ranker's
 * score-descending order only for the complete pre-filter candidate view.
 */
export function buildLocalRetrievalLogStages(packet) {
    const filtered = (packet?.snippets ?? []).map(toLogCandidate);
    const dropped = (packet?.droppedByLlm ?? []).map(toLogCandidate);
    return {
        candidates: [...filtered, ...dropped].sort((left, right) => right.score - left.score),
        filtered,
        dropped,
    };
}
function toLogCandidate(snippet) {
    return {
        tier: inferSnippetTier(snippet.refKind),
        refKind: snippet.refKind,
        refId: snippet.refId,
        score: snippet.score ?? 0,
        snippet: snippet.body,
        scoreDetails: snippet.scoreDetails,
    };
}
function inferSnippetTier(refKind) {
    if (refKind === "skill")
        return 1;
    if (refKind === "world-model")
        return 3;
    return 2;
}
//# sourceMappingURL=retrieval-log.js.map