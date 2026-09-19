import type { Embedder } from "../embedding/types.js";
export type ResourcePriority = "foreground" | "background";
export interface ForegroundResources {
    readonly shutdownSignal: AbortSignal;
    /** Combine a request signal with the pipeline lifecycle signal. */
    signalFor(signal?: AbortSignal): AbortSignal;
    /** Mark the complete turn.start path as foreground work. Idempotent release. */
    enterForeground(): () => void;
    /** Background LLM work waits here before acquiring its existing semaphore. */
    waitForBackground(signal?: AbortSignal): Promise<void>;
    /** Priority-aware, non-preemptive embedding admission. */
    acquireEmbedding(priority: ResourcePriority, signal?: AbortSignal): Promise<() => void>;
    /** Reject queued work and cancel provider calls before pipeline drain. */
    shutdown(reason?: string): void;
}
export interface ForegroundResourceOptions {
    embeddingConcurrency?: number;
    /** Prevent background starvation during a sustained foreground stream. */
    maxForegroundBurst?: number;
}
export declare function createForegroundResources(options?: ForegroundResourceOptions): ForegroundResources;
/**
 * Keep the Embedder contract intact while moving provider round-trips behind
 * the shared priority arbiter. Background batches are deliberately chunked
 * so one enrichment pass cannot monopolize the provider for an entire queue.
 */
export declare function prioritizeEmbedder(inner: Embedder | null, resources: ForegroundResources, priority: ResourcePriority, backgroundChunkSize?: number): Embedder | null;
//# sourceMappingURL=foreground-resources.d.ts.map