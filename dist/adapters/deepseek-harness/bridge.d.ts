/**
 * DeepSeek Harness lifecycle bridge.
 *
 * The bridge intentionally depends only on MemOS's stable agent contract and
 * structural host shapes. The Cordis-facing entrypoint owns imports from DSH;
 * keeping them out of this file makes the lifecycle logic independently
 * testable and prevents DSH types from leaking into the algorithm core.
 */
import type { EpisodeId, RuntimeNamespace } from "../../agent-contract/dto.js";
import type { MemoryCore } from "../../agent-contract/memory-core.js";
import type { DeepSeekHarnessLlmRoute } from "./host-llm.js";
export declare const DEEPSEEK_HARNESS_AGENT = "deepseek-harness";
export declare const DEEPSEEK_HARNESS_PLUGIN = "memos-local-memory";
export interface DshContentBlockLike {
    readonly type: string;
    readonly [key: string]: unknown;
}
export interface DshUserMessageLike {
    readonly id: string;
    readonly role: "user";
    readonly content: readonly DshContentBlockLike[];
    readonly source: {
        readonly kind: string;
        readonly [key: string]: unknown;
    };
}
export interface DshSessionLike {
    readonly id: string;
    /** Canonical history is available on real DSH Session instances. */
    readonly events?: readonly DshSessionEventLike[];
    readonly header?: {
        readonly cwd?: string;
        /** Events below this boundary were inherited from a fork parent. */
        readonly seedLength?: number;
        readonly [key: string]: unknown;
    };
    readonly requestHeader?: () => {
        readonly config?: {
            readonly provider?: string;
            readonly model?: string;
            readonly reasoningEffort?: string;
            readonly [key: string]: unknown;
        };
        readonly [key: string]: unknown;
    } | undefined;
}
export interface DshAgentLike {
    readonly id: string;
    readonly session: DshSessionLike;
    readonly options?: {
        readonly provider?: string;
        readonly model?: string;
        readonly reasoningEffort?: string;
        readonly [key: string]: unknown;
    };
}
export type DshPreStepDecisionLike = {
    readonly kind: "reject";
} | {
    readonly kind: "enter";
    readonly messages: DshUserMessageLike[];
};
export interface DshPreStepPayloadLike {
    readonly agent: DshAgentLike;
    readonly messages: DshUserMessageLike[];
    readonly turn: number;
    readonly step: number;
    readonly signal: AbortSignal;
}
export interface DshSessionEventLike {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: unknown;
    readonly surfaceOp?: "append" | {
        readonly op: "replace";
        readonly start: number;
        readonly end: number;
    };
}
export interface DeepSeekHarnessBridgeOptions {
    core: MemoryCore;
    profileId: string;
    recallEnabled: boolean;
    captureEnabled: boolean;
    recallTimeoutMs: number;
    contextMaxChars: number;
    createRecallMessage: (text: string) => DshUserMessageLike;
    runWithLlmRoute?: <T>(route: DeepSeekHarnessLlmRoute, operation: () => T) => T;
    now?: () => number;
    onWarn?: (message: string, error?: unknown) => void;
    onInfo?: (message: string) => void;
}
/**
 * Owns per-session turn correlation and a serial write queue.
 *
 * DSH's `session/event` hook is a synchronous firehose. The bridge therefore
 * records events synchronously and queues lifecycle writes. Retrieval is the
 * only foreground memory operation in `beforeStep()` because its returned
 * context must enter that exact model request. Relation/intent routing and
 * capture stay in the serial background queue; only disposal drains it.
 */
export declare class DeepSeekHarnessBridge {
    private readonly core;
    private readonly profileId;
    private readonly recallEnabled;
    private readonly captureEnabled;
    private readonly recallTimeoutMs;
    private readonly contextMaxChars;
    private readonly createRecallMessage;
    private readonly runWithLlmRoute?;
    private readonly now;
    private readonly onWarn;
    private readonly onInfo;
    private readonly turns;
    private readonly activeTurnBySession;
    private readonly pendingBySession;
    private readonly lastLlmRouteBySession;
    private readonly memorySessionOwners;
    private readonly memorySessionsByDsh;
    private readonly knownDshSessions;
    private readonly closingBySession;
    private readonly closingMemorySessions;
    private disposePromise;
    constructor(options: DeepSeekHarnessBridgeOptions);
    beforeStep(payload: DshPreStepPayloadLike, next: () => Promise<DshPreStepDecisionLike>): Promise<DshPreStepDecisionLike>;
    onSessionEvent(session: DshSessionLike, event: DshSessionEventLike): void;
    currentEpisode(session: DshSessionLike): EpisodeId | undefined;
    namespaceFor(session: DshSessionLike): RuntimeNamespace;
    flush(sessionId?: string): Promise<void>;
    closeSession(session: DshSessionLike): Promise<void>;
    dispose(): Promise<void>;
    private ensureTurn;
    private getTurn;
    private deleteTurn;
    private enqueue;
    private captureTurn;
    private recordCompletedToolOutcomes;
    private handleToolResult;
    private withLlmRoute;
    private rememberLlmRoute;
    private withSessionLlmRoute;
    private handleCodeDispatchStart;
    private handleCodeDispatchResult;
    private memorySessionIdsFor;
    private trackMemorySession;
    private ownsMemorySession;
    private waitForMemorySessionClose;
    private releaseMemorySession;
    private warn;
}
export declare function createDeepSeekHarnessBridge(options: DeepSeekHarnessBridgeOptions): DeepSeekHarnessBridge;
/** Resolve the public DSH provider/model route without touching credentials. */
export declare function extractDeepSeekHarnessLlmRoute(agent: DshAgentLike): DeepSeekHarnessLlmRoute | undefined;
//# sourceMappingURL=bridge.d.ts.map