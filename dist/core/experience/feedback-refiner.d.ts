/**
 * LLM-assisted feedback refiner.
 *
 * Transforms raw user feedback into actionable guidance, following the same
 * structure as L2 induction (title, trigger, procedure, verification, caveats).
 *
 * This ensures consistency between feedback-derived experiences and L2-induced
 * policies, making them interchangeable in retrieval and injection.
 */
import type { LlmClient } from "../llm/index.js";
import type { TraceRow } from "../types.js";
export interface RefinedGuidance {
    /** Short, actionable title (e.g., "确认排序方向需求"). */
    title: string;
    /** When to apply this guidance (trigger condition). */
    trigger: string;
    /** What to do (actionable procedure). */
    procedure: string;
    /** What to avoid (anti-pattern). */
    caveats: string[];
    /** How to verify correctness. */
    verification: string;
    /** Confidence in this refinement (0-1). */
    confidence: number;
    /** Refinement method: "llm" or "rule". */
    method: "llm" | "rule";
}
export interface RefineInput {
    /** Raw user feedback text. */
    feedbackText: string;
    /** User's original request (last turn). */
    userRequest?: string;
    /** Agent's response that triggered the feedback (last turn). */
    agentResponse?: string;
    /** Full episode context (first turn + last 3 turns). */
    episodeContext?: string;
    /** Feedback polarity: positive, negative, neutral. */
    polarity: "positive" | "negative" | "neutral";
    /** Trace context (optional). */
    trace?: TraceRow | null;
}
export interface FeedbackRefinerOptions {
    llm?: LlmClient;
    timeoutMs?: number;
    disableLlm?: boolean;
}
export interface FeedbackRefiner {
    refine(input: RefineInput): Promise<RefinedGuidance>;
}
export declare function createFeedbackRefiner(opts?: FeedbackRefinerOptions): FeedbackRefiner;
//# sourceMappingURL=feedback-refiner.d.ts.map