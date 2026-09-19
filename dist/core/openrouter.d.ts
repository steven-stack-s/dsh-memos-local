/** Shared OpenRouter request routing for OpenAI-compatible providers. */
export interface OpenRouterRoutingConfig {
    endpoint?: string;
    /** Explicitly enable OpenRouter fields for a reverse proxy or CNAME. */
    openRouter?: boolean;
    providerIgnore?: string[];
    providerOrder?: string[];
}
export declare function applyOpenRouterProviderRouting(config: OpenRouterRoutingConfig, body: Record<string, unknown>): boolean;
//# sourceMappingURL=openrouter.d.ts.map