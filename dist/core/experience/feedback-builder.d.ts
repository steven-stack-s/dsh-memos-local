import type { EpisodeId, FeedbackRow, PolicyId, RuntimeNamespace, TraceId, TraceRow } from "../types.js";
import type { Embedder } from "../embedding/types.js";
import type { LlmClient } from "../llm/index.js";
import type { Repos } from "../storage/repos/index.js";
export interface FeedbackExperienceResult {
    created: boolean;
    policyId?: PolicyId;
    skippedReason?: string;
}
export interface FeedbackExperienceDeps {
    repos: Pick<Repos, "policies" | "embeddingRetryQueue" | "traces">;
    embedder: Embedder | null;
    llm?: LlmClient;
    namespace: RuntimeNamespace;
    now?: () => number;
}
export interface FeedbackExperienceInput {
    feedback: FeedbackRow;
    episode?: {
        id: EpisodeId;
        traceIds?: readonly TraceId[];
        rTask?: number | null;
    } | null;
    trace?: TraceRow | null;
}
export declare function runFeedbackExperience(input: FeedbackExperienceInput, deps: FeedbackExperienceDeps): Promise<FeedbackExperienceResult>;
export declare function feedbackText(feedback: FeedbackRow): string;
//# sourceMappingURL=feedback-builder.d.ts.map