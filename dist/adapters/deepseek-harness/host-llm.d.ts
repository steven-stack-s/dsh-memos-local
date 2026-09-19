/** Host-LLM bridge that delegates MemOS calls to DeepSeek Harness routing. */
import { type LlmCallConfig, type LlmResolvedModelInfo, type PreparedLlmCall } from "@deepseek-ai/dsh-llm";
import type { HostLlmBridge } from "../../core/llm/host-bridge.js";
/** Atomic provider/model route captured from the DSH agent that owns a turn. */
export interface DeepSeekHarnessLlmRoute {
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
    readonly sessionId?: string;
}
/** Public subset of DSH's LLM runtime used by this adapter. */
export interface DeepSeekHarnessLlmLike {
    resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>;
}
export interface DeepSeekHarnessHostLlmBridge extends HostLlmBridge {
    /** Drop exact-route capability snapshots after a DSH adapter topology update. */
    invalidateModelCapabilities(): void;
}
/**
 * Async route scope for MemOS work spawned by one DSH session.
 *
 * The route belongs in async-local state instead of a mutable singleton: DSH
 * can capture multiple sessions concurrently, and credentials are resolved by
 * the DSH LLM runtime only after the exact provider/model pair reaches it.
 */
export declare class DeepSeekHarnessLlmRouteContext {
    private readonly storage;
    run<T>(route: DeepSeekHarnessLlmRoute, callback: () => T): T;
    current(): DeepSeekHarnessLlmRoute | undefined;
}
export interface CreateDeepSeekHarnessHostLlmBridgeOptions {
    readonly llm: DeepSeekHarnessLlmLike;
    readonly routes: DeepSeekHarnessLlmRouteContext;
}
/**
 * Create a MemOS HostLlmBridge backed by DSH's public streaming runtime.
 *
 * No credential is accepted or read here. DSH resolves credentials inside its
 * registered provider adapter, using the same route as the owning agent turn.
 */
export declare function createDeepSeekHarnessHostLlmBridge(options: CreateDeepSeekHarnessHostLlmBridgeOptions): DeepSeekHarnessHostLlmBridge;
//# sourceMappingURL=host-llm.d.ts.map