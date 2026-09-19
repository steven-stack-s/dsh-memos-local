import type { InjectionPacket, InjectionScoreDetails } from "../../agent-contract/dto.js";
export interface RetrievalLogCandidate {
    tier: 1 | 2 | 3;
    refKind: string;
    refId: string;
    score: number;
    snippet: string;
    scoreDetails?: InjectionScoreDetails;
}
export interface LocalRetrievalLogStages {
    /** Mechanical/ranked candidates before the local LLM relevance pass. */
    candidates: RetrievalLogCandidate[];
    /** Candidates retained by the local LLM relevance pass. */
    filtered: RetrievalLogCandidate[];
    /** Candidates rejected by the local LLM relevance pass. */
    dropped: RetrievalLogCandidate[];
}
/**
 * `InjectionPacket.snippets` is already post-LLM-filter. Reconstruct the
 * Logs-page funnel from the kept and explicitly surfaced dropped snippets
 * instead of trying to remove dropped ids from an already-filtered list.
 * The LLM may reorder its kept subset, so restore the mechanical ranker's
 * score-descending order only for the complete pre-filter candidate view.
 */
export declare function buildLocalRetrievalLogStages(packet: Pick<InjectionPacket, "snippets" | "droppedByLlm"> | null | undefined): LocalRetrievalLogStages;
//# sourceMappingURL=retrieval-log.d.ts.map