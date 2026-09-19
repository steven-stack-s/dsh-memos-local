/** Read-oriented MemOS tools exposed through DeepSeek Harness. */
import type { Context } from "@deepseek-ai/cordis";
import type { MemoryCore } from "../../agent-contract/memory-core.js";
import { type DshSessionLike } from "./bridge.js";
import type { DeepSeekHarnessLlmRoute } from "./host-llm.js";
export interface DeepSeekHarnessToolsOptions {
    core: MemoryCore;
    profileId: string;
    maxBodyChars: number;
    /** Shared foreground retrieval budget used by memos_search. */
    searchTimeoutMs?: number;
    now?: () => number;
    currentEpisode: (session: DshSessionLike) => string | undefined;
    runWithLlmRoute: <T>(route: DeepSeekHarnessLlmRoute, operation: () => Promise<T>) => Promise<T>;
}
export declare function registerDeepSeekHarnessTools(ctx: Context, options: DeepSeekHarnessToolsOptions): () => void;
//# sourceMappingURL=tools.d.ts.map