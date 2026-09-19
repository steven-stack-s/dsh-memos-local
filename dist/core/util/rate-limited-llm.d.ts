import type { LlmClient } from "../llm/types.js";
import type { Semaphore } from "./semaphore.js";
import type { ForegroundResources } from "./foreground-resources.js";
/**
 * Wrap an LLM client so expensive background subscribers share one
 * process-wide concurrency budget without changing call-site semantics.
 */
export declare function rateLimitLlmClient(client: LlmClient | null, semaphore: Semaphore, resources?: ForegroundResources): LlmClient | null;
//# sourceMappingURL=rate-limited-llm.d.ts.map