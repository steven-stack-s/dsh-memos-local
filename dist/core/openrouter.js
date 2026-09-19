/** Shared OpenRouter request routing for OpenAI-compatible providers. */
const OPENROUTER_HOSTS = new Set(["openrouter.ai"]);
function isOpenRouter(config) {
    if (config.openRouter)
        return true;
    if (!config.endpoint)
        return false;
    try {
        return OPENROUTER_HOSTS.has(new URL(config.endpoint).hostname.toLowerCase());
    }
    catch {
        return false;
    }
}
export function applyOpenRouterProviderRouting(config, body) {
    if (!isOpenRouter(config))
        return false;
    const provider = {};
    if (config.providerIgnore?.length)
        provider.ignore = config.providerIgnore;
    if (config.providerOrder?.length)
        provider.order = config.providerOrder;
    if (Object.keys(provider).length > 0)
        body.provider = provider;
    return true;
}
//# sourceMappingURL=openrouter.js.map