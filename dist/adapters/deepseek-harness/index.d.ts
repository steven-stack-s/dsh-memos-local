/** Native Cordis adapter for DeepSeek Harness. */
import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import { type ResolvedConfig } from "../../core/config/index.js";
import { type DeepSeekHarnessHostLlmBridge } from "./host-llm.js";
export declare const name = "memos-local-memory";
export declare const inject: string[];
export declare const DEEPSEEK_HARNESS_VIEWER_PORT = 18801;
export declare const DEEPSEEK_HARNESS_VIEWER_RETRY_DELAYS_MS: readonly [250, 500, 1000, 2000, 2000];
export declare const DEEPSEEK_HARNESS_MAX_FOREGROUND_SEARCH_MS = 3000;
export interface Config {
    enabled: boolean;
    profileId: string;
    home: string;
    recallEnabled: boolean;
    captureEnabled: boolean;
    toolsEnabled: boolean;
    hostLlmEnabled: boolean;
    viewerEnabled: boolean;
    viewerPort: number;
    recallTimeoutMs: number;
    contextMaxChars: number;
    toolResultMaxChars: number;
    failOnStartupError: boolean;
}
export declare const Config: Schema<Config>;
/** Keep DSH foreground memory work within the product-level 3s SLA. */
export declare function deepSeekHarnessSearchTimeoutMs(configuredMs: number): number;
export declare function deepSeekHarnessMemoryGuidance(toolsEnabled: boolean): string;
export declare function defaultDeepSeekHarnessHome(configuredHome: string, env?: NodeJS.ProcessEnv, userHome?: string): string;
/** Use DSH's configured model only when MemOS has no explicit LLM provider. */
export declare function configureDeepSeekHarnessHostLlm(config: ResolvedConfig, enabled: boolean): ResolvedConfig;
/** Refresh exact-model capability snapshots whenever DSH replaces an adapter. */
export declare function registerDeepSeekHarnessHostLlmCapabilityInvalidation(ctx: Context, bridge: DeepSeekHarnessHostLlmBridge): () => void;
/** Autonomous recovery has no owning DSH turn from which to capture a route. */
export declare function deepSeekHarnessAutoRecoveryEnabled(config: ResolvedConfig): boolean;
/** Locate Viewer assets without depending on whether they are built yet. */
export declare function resolveDeepSeekHarnessViewerStaticRoot(adapterDir?: string): string;
/**
 * Resolve this plugin's package version for `bootstrapMemoryCore`.
 *
 * The version surfaces through `core.health().version` and therefore in the
 * Viewer sidebar and the `/api/v1/health` payload. Without it the core falls
 * back to the literal `"dev"`, which is what made the sidebar render `vdev`.
 *
 * Best-effort: a missing/unreadable manifest yields `undefined` so the
 * caller keeps the core's own fallback instead of failing startup.
 */
export declare function resolveDeepSeekHarnessPluginVersion(adapterDir?: string): string | undefined;
/** Keep the unauthenticated first-run Viewer strictly on local interfaces. */
export declare function isDeepSeekHarnessViewerLoopbackHost(host: string): boolean;
/** Bootstrap MemOS and register all lifecycle hooks as one Cordis plugin. */
export declare function apply(ctx: Context, config: Config): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map