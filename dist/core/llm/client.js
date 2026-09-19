/**
 * `LlmClient` — the only surface the rest of `core/` sees.
 *
 * Responsibilities:
 *   - Pick a provider from config.
 *   - Normalize `string | LlmMessage[]` inputs.
 *   - Inject JSON-mode system hints when the provider has no native mode.
 *   - Parse JSON output with `parseLlmJson` + optional schema validation,
 *     with a small (default 1) malformed-retry budget.
 *   - Host fallback: when the primary provider throws LLM_UNAVAILABLE /
 *     LLM_RATE_LIMITED / LLM_TIMEOUT and `config.fallbackToHost=true` AND
 *     the adapter has registered a `HostLlmBridge`, retry once via host.
 *   - Structured audit via `log.llm({...})` for every successful call.
 *   - Stream: provider-native when available, otherwise wrap `complete` in a
 *     single-chunk iterable so call sites don't have to branch.
 */
import { ERROR_CODES, MemosError } from "../../agent-contract/errors.js";
import { rootLogger } from "../logger/index.js";
import { extractRetryDiagnostics } from "../util/retry-after.js";
import { getHostLlmBridge } from "./host-bridge.js";
import { buildJsonSystemHint, parseLlmJson } from "./json-mode.js";
import { AnthropicLlmProvider } from "./providers/anthropic.js";
import { BedrockLlmProvider } from "./providers/bedrock.js";
import { GeminiLlmProvider } from "./providers/gemini.js";
import { HostLlmProvider } from "./providers/host.js";
import { LocalOnlyLlmProvider } from "./providers/local-only.js";
import { OpenAiLlmProvider } from "./providers/openai.js";
const DEFAULT_MAX_TOKENS = 1024;
// ─── Factory ─────────────────────────────────────────────────────────────────
export function createLlmClient(config) {
    const provider = makeProviderFor(config.provider);
    return createLlmClientWithProvider(config, provider);
}
export function createLlmClientWithProvider(config, provider) {
    const facadeLog = rootLogger.child({ channel: "llm" });
    const providerChannel = `llm.${provider.name}`;
    const providerLog = rootLogger.child({ channel: providerChannel });
    const jsonLog = rootLogger.child({ channel: "llm.json" });
    let requests = 0;
    let hostFallbacks = 0;
    let failures = 0;
    let retries = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let lastOkAt = null;
    let lastFallbackAt = null;
    let lastError = null;
    // ─── Circuit breaker state (issue #1897) ─────────────────────────────────
    // Per-client breaker that trips on terminal provider errors (401/402/403,
    // "insufficient balance", "invalid api key", "unauthorized", "account
    // suspended", "billing"). Short-circuits subsequent calls inside the
    // facade so the broken provider is not contacted again until cool-down
    // elapses. Half-open: the next call after `circuitOpenUntil` probes the
    // provider; success closes the breaker, terminal failure re-opens it.
    const breakerCfg = config.circuitBreaker ?? {};
    const breakerEnabled = breakerCfg.enabled !== false;
    const breakerCooldownMs = Math.max(30_000, breakerCfg.cooldownMs ?? 300_000);
    const breakerIsTerminal = breakerCfg.isTerminal ?? defaultIsTerminal;
    const breakerNow = breakerCfg.now ?? Date.now;
    let circuitOpenUntil = null;
    let circuitOpenedReason = null;
    let lastCircuitOpenStatusAt = null;
    function breakerIsOpen() {
        if (!breakerEnabled)
            return false;
        if (circuitOpenUntil === null)
            return false;
        if (breakerNow() >= circuitOpenUntil) {
            // Cool-down elapsed → transition to half-open. We do NOT clear
            // `circuitOpenUntil` yet so the very first probe attempt that
            // races with the cool-down boundary doesn't fall through to "no
            // breaker" twice. The next call's success/failure handler resets
            // or re-opens the breaker explicitly.
            return false;
        }
        return true;
    }
    function breakerTrip(err) {
        if (!breakerEnabled)
            return;
        circuitOpenUntil = breakerNow() + breakerCooldownMs;
        circuitOpenedReason = summarizeErrMessage(err);
        // Reset the coalescer so the first suppressed call after a fresh
        // trip always emits a `circuit_open` row.
        lastCircuitOpenStatusAt = null;
        facadeLog.warn("circuit_breaker.trip", {
            provider: provider.name,
            model: config.model,
            until: circuitOpenUntil,
            reason: circuitOpenedReason,
        });
    }
    function breakerRecordSuccess() {
        if (!breakerEnabled)
            return;
        if (circuitOpenUntil !== null) {
            facadeLog.info("circuit_breaker.close", {
                provider: provider.name,
                model: config.model,
            });
        }
        circuitOpenUntil = null;
        circuitOpenedReason = null;
        lastCircuitOpenStatusAt = null;
    }
    /**
     * Emit a coalesced `circuit_open` audit row. At most one row per
     * `cooldownMs/12` window per client — bounds audit-row spam while
     * still surfacing the suppressed-call event in the Logs viewer.
     * The first suppressed call after a fresh trip always emits.
     */
    function maybeEmitCircuitOpenStatus(opts, op) {
        if (!config.onStatus)
            return;
        const at = breakerNow();
        const coalesceWindow = Math.max(5_000, Math.floor(breakerCooldownMs / 12));
        if (lastCircuitOpenStatusAt !== null &&
            at - lastCircuitOpenStatusAt < coalesceWindow) {
            return;
        }
        lastCircuitOpenStatusAt = at;
        try {
            config.onStatus({
                status: "circuit_open",
                provider: provider.name,
                model: config.model,
                message: circuitOpenedReason ?? "(unknown reason)",
                at,
                durationMs: 0,
                op,
                episodeId: opts?.episodeId,
                phase: opts?.phase,
            });
        }
        catch {
            /* status sink errors are non-fatal */
        }
    }
    function throwBreakerOpen() {
        throw makeBreakerOpenError();
    }
    function makeBreakerOpenError() {
        const until = circuitOpenUntil ?? breakerNow();
        return new MemosError(ERROR_CODES.LLM_UNAVAILABLE, `circuit_open: ${circuitOpenedReason ?? "terminal provider error"}`, {
            circuitOpen: true,
            until,
            provider: provider.name,
            model: config.model,
        });
    }
    function canUseHostFallback() {
        return (config.fallbackToHost === true &&
            provider.name !== "host" &&
            getHostLlmBridge() !== null);
    }
    /**
     * Mark a successful primary-provider call. We **do not** clear
     * `lastError` / `lastFallbackAt` here — the viewer picks the most
     * recent event by timestamp to colour the overview card, so an
     * earlier failure that already produced a `system_error` row stays
     * visible until a later success out-dates it.
     */
    function markOk() {
        lastOkAt = Date.now();
        return lastOkAt;
    }
    /**
     * Mark a primary-provider failure that was rescued by the host LLM
     * bridge (yellow card). The original primary error is still kept on
     * `lastError` so the viewer can show *why* fallback kicked in, and
     * `lastFallbackAt` tracks when fallback happened so the timestamp
     * comparison renders yellow instead of red.
     */
    function markFallback(err) {
        const at = Date.now();
        lastFallbackAt = at;
        lastError = { at, message: summarizeErrMessage(err) };
        return at;
    }
    /**
     * Mark a terminal failure — either no fallback configured or the
     * host fallback also failed (red card).
     */
    function markFail(err) {
        const at = Date.now();
        lastError = { at, message: summarizeErrMessage(err) };
        return at;
    }
    function normalizeMessages(input) {
        if (typeof input === "string")
            return [{ role: "user", content: input }];
        if (!Array.isArray(input) || input.length === 0) {
            throw new MemosError(ERROR_CODES.INVALID_ARGUMENT, "LLM messages array is empty");
        }
        // Ensure system messages are always at the beginning.
        // Some models (e.g. Qwen3.6 via vLLM) enforce "system must be first"
        // in their Jinja2 chat templates, returning HTTP 400 otherwise.
        // See: https://github.com/MemTensor/MemOS/issues/XXXX
        const systems = input.filter((m) => m.role === "system");
        const nonSystems = input.filter((m) => m.role !== "system");
        if (systems.length === 0)
            return input;
        // Fast path: single system already at position 0, no later systems.
        if (systems.length === 1 &&
            input[0]?.role === "system" &&
            !input.slice(1).some((m) => m.role === "system")) {
            return input;
        }
        // Merge all system contents into one leading message, preserving order.
        const merged = systems.map((s) => s.content).join("\n\n");
        return [{ role: "system", content: merged }, ...nonSystems];
    }
    function inject(messages, systemInsert) {
        if (!systemInsert)
            return messages;
        // Merge into existing top system if present, otherwise prepend.
        if (messages[0]?.role === "system") {
            return [
                { role: "system", content: `${messages[0].content}\n\n${systemInsert}` },
                ...messages.slice(1),
            ];
        }
        return [{ role: "system", content: systemInsert }, ...messages];
    }
    function ensureJsonWordInUserMessage(messages) {
        const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
        if (lastUserIdx < 0)
            return [...messages, { role: "user", content: "Return valid json only." }];
        const msg = messages[lastUserIdx];
        if (/\bjson\b/i.test(msg.content))
            return messages;
        const out = messages.slice();
        out[lastUserIdx] = {
            ...msg,
            content: `${msg.content}\n\nReturn valid json only.`,
        };
        return out;
    }
    function buildCallInput(opts, jsonMode) {
        return {
            temperature: opts?.temperature ?? config.temperature,
            maxTokens: opts?.maxTokens ?? config.maxTokens ?? DEFAULT_MAX_TOKENS,
            jsonMode,
            stop: opts?.stop,
        };
    }
    function makeCtx(opts, pLog) {
        return {
            config: {
                ...config,
                timeoutMs: opts?.timeoutMs ?? config.timeoutMs,
            },
            log: pLog,
            signal: opts?.signal,
            deadlineAt: opts?.deadlineAt,
        };
    }
    async function callWithFallback(messages, input, opts, op) {
        // ── Circuit breaker short-circuit ──
        // When the breaker is open we never reach the primary provider, so
        // no request is generated against the broken paid API. We still
        // emit (coalesced) `circuit_open` status rows so the Logs viewer /
        // Overview can surface that suppression is happening.
        if (breakerIsOpen()) {
            maybeEmitCircuitOpenStatus(opts, op);
            if (canUseHostFallback()) {
                return callHostFallback(makeBreakerOpenError(), messages, input, opts, op, {
                    keepBreakerOpen: true,
                    notifyError: false,
                });
            }
            throwBreakerOpen();
        }
        requests++;
        const startedAt = Date.now();
        try {
            const raw = await provider.complete(messages, input, makeCtx(opts, asProviderLog(providerLog)));
            const completion = {
                text: raw.text,
                provider: provider.name,
                model: config.model,
                finishReason: raw.finishReason,
                usage: raw.usage,
                servedBy: provider.name,
                durationMs: raw.durationMs,
            };
            record(completion, op, messages);
            const okAt = markOk();
            breakerRecordSuccess();
            notifyStatus({
                status: "ok",
                provider: provider.name,
                model: config.model,
                at: okAt,
                durationMs: completion.durationMs,
                op,
                episodeId: opts?.episodeId,
                phase: opts?.phase,
            });
            return { completion };
        }
        catch (err) {
            if (shouldFallback(err, config, provider.name)) {
                const primaryTerminal = breakerIsTerminal(err);
                if (primaryTerminal)
                    breakerTrip(err);
                try {
                    return await callHostFallback(err, messages, input, opts, op, {
                        keepBreakerOpen: primaryTerminal,
                        notifyError: true,
                    });
                }
                catch (hostErr) {
                    failures++;
                    const failAt = markFail(hostErr);
                    facadeLog.error("host.fallback_failed", {
                        primary: summarizeErr(err),
                        host: summarizeErr(hostErr),
                    });
                    // Primary AND host bridge both failed. Trip on a terminal
                    // primary error (the one the operator typically needs to fix
                    // — host bridge failures are usually transient stdio issues).
                    if (breakerIsTerminal(err))
                        breakerTrip(err);
                    notifyOnError(hostErr);
                    notifyStatus({
                        status: "error",
                        provider: provider.name,
                        model: config.model,
                        message: summarizeErrMessage(hostErr),
                        code: hostErr instanceof MemosError ? hostErr.code : undefined,
                        ...extractRetryDiagnostics(hostErr instanceof MemosError ? hostErr.details : undefined),
                        at: failAt,
                        durationMs: Date.now() - startedAt,
                        fallbackProvider: "host",
                        op,
                        episodeId: opts?.episodeId,
                        phase: opts?.phase,
                    });
                    throw hostErr instanceof MemosError
                        ? hostErr
                        : new MemosError(ERROR_CODES.LLM_UNAVAILABLE, `host fallback failed: ${hostErr.message ?? String(hostErr)}`);
                }
            }
            failures++;
            const failAt = markFail(err);
            if (breakerIsTerminal(err))
                breakerTrip(err);
            notifyOnError(err);
            notifyStatus({
                status: "error",
                provider: provider.name,
                model: config.model,
                message: summarizeErrMessage(err),
                code: err instanceof MemosError ? err.code : undefined,
                ...extractRetryDiagnostics(err instanceof MemosError ? err.details : undefined),
                at: failAt,
                durationMs: Date.now() - startedAt,
                op,
                episodeId: opts?.episodeId,
                phase: opts?.phase,
            });
            throw err instanceof MemosError
                ? err
                : new MemosError(ERROR_CODES.LLM_UNAVAILABLE, `${provider.name} failed: ${err.message ?? String(err)}`, { provider: provider.name });
        }
    }
    /**
     * Forward a terminal failure to the bootstrap-supplied sink (if any).
     * Wrapped so a buggy sink can never replace the original error the
     * caller is about to receive. Skipped silently when no sink is set.
     */
    function notifyOnError(err) {
        if (!config.onError)
            return;
        try {
            config.onError({
                provider: provider.name,
                model: config.model,
                message: summarizeErrMessage(err),
                code: err instanceof MemosError ? err.code : undefined,
                at: Date.now(),
                ...extractRetryDiagnostics(err instanceof MemosError ? err.details : undefined),
            });
        }
        catch {
            /* sink errors are non-fatal */
        }
    }
    function notifyStatus(detail) {
        if (!config.onStatus)
            return;
        try {
            config.onStatus(detail);
        }
        catch {
            /* status sink errors are non-fatal */
        }
    }
    function record(completion, op, messages) {
        if (completion.usage?.promptTokens)
            totalPromptTokens += completion.usage.promptTokens;
        if (completion.usage?.completionTokens)
            totalCompletionTokens += completion.usage.completionTokens;
        facadeLog.llm({
            provider: completion.provider,
            model: completion.model,
            op,
            ms: completion.durationMs,
            promptTokens: completion.usage?.promptTokens,
            completionTokens: completion.usage?.completionTokens,
            totalTokens: completion.usage?.totalTokens,
            status: "ok",
            // Prompt redaction is handled inside `log.llm` based on config —
            // we pass the first ~200 chars of each message as a compact echo.
            prompt: messages.map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n"),
            completion: completion.text.slice(0, 1000),
        });
    }
    async function complete(input, opts) {
        const messages = normalizeMessages(input);
        const msgsWithJsonHint = opts?.jsonMode
            ? ensureJsonWordInUserMessage(inject(messages, buildJsonSystemHint()))
            : messages;
        const call = buildCallInput(opts, opts?.jsonMode === true);
        const { completion } = await callWithFallback(msgsWithJsonHint, call, opts, opts?.op ?? "complete");
        return completion;
    }
    async function completeJson(input, opts = {}) {
        const messages = normalizeMessages(input);
        const systemHint = buildJsonSystemHint(opts.schemaHint);
        const msgs = ensureJsonWordInUserMessage(inject(messages, systemHint));
        const call = buildCallInput(opts, true);
        const op = opts.op ?? "complete.json";
        const maxMalformedRetries = Math.max(0, opts.malformedRetries ?? 1);
        let attempt = 0;
        let lastRaw = "";
        let lastErr = null;
        while (attempt <= maxMalformedRetries) {
            attempt++;
            const { completion } = await callWithFallback(msgs, call, opts, op);
            lastRaw = completion.text;
            try {
                const parsed = opts.parse
                    ? opts.parse(completion.text)
                    : parseLlmJson(completion.text, { provider: provider.name, op });
                // `validate` is an `asserts` function; calling it through a nullable
                // property loses the assertion type. Cast through `unknown` so TS
                // doesn't try to narrow the call target.
                if (opts.validate) {
                    opts.validate(parsed);
                }
                return {
                    value: parsed,
                    raw: completion.text,
                    provider: completion.provider,
                    model: completion.model,
                    finishReason: completion.finishReason,
                    usage: completion.usage,
                    servedBy: completion.servedBy,
                    durationMs: completion.durationMs,
                };
            }
            catch (err) {
                lastErr = err;
                jsonLog.warn("malformed", {
                    op,
                    attempt,
                    err: summarizeErr(err),
                });
                if (attempt <= maxMalformedRetries) {
                    retries++;
                    continue;
                }
            }
        }
        throw lastErr instanceof MemosError
            ? lastErr
            : new MemosError(ERROR_CODES.LLM_OUTPUT_MALFORMED, "LLM JSON unparseable after retries", {
                provider: provider.name,
                op,
                rawPreview: lastRaw.slice(0, 512),
            });
    }
    async function* stream(input, opts) {
        const messages = normalizeMessages(input);
        const call = buildCallInput(opts, opts?.jsonMode === true);
        const ctx = makeCtx(opts, asProviderLog(providerLog));
        // Short-circuit stream calls when the breaker is open. We do not
        // count a suppressed call against `requests` (no network hit).
        if (breakerIsOpen()) {
            maybeEmitCircuitOpenStatus(opts, opts?.op ?? "stream");
            throwBreakerOpen();
        }
        requests++;
        const start = Date.now();
        let acc = "";
        let usage;
        try {
            if (typeof provider.stream === "function") {
                for await (const chunk of provider.stream(messages, call, ctx)) {
                    if (chunk.delta)
                        acc += chunk.delta;
                    if (chunk.usage)
                        usage = chunk.usage;
                    yield chunk;
                }
            }
            else {
                const raw = await provider.complete(messages, call, ctx);
                acc = raw.text;
                usage = raw.usage;
                yield { delta: raw.text, done: false };
                yield { delta: "", done: true, usage };
            }
            facadeLog.llm({
                provider: provider.name,
                model: config.model,
                op: opts?.op ?? "stream",
                ms: Date.now() - start,
                promptTokens: usage?.promptTokens,
                completionTokens: usage?.completionTokens,
                totalTokens: usage?.totalTokens,
                status: "ok",
                prompt: messages.map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n"),
                completion: acc.slice(0, 1000),
            });
            if (usage?.promptTokens)
                totalPromptTokens += usage.promptTokens;
            if (usage?.completionTokens)
                totalCompletionTokens += usage.completionTokens;
            const okAt = markOk();
            breakerRecordSuccess();
            notifyStatus({
                status: "ok",
                provider: provider.name,
                model: config.model,
                at: okAt,
                durationMs: Date.now() - start,
                op: opts?.op ?? "stream",
                episodeId: opts?.episodeId,
                phase: opts?.phase,
            });
        }
        catch (err) {
            failures++;
            const failAt = markFail(err);
            if (breakerIsTerminal(err))
                breakerTrip(err);
            facadeLog.error("stream.failed", { err: summarizeErr(err) });
            notifyOnError(err);
            notifyStatus({
                status: "error",
                provider: provider.name,
                model: config.model,
                message: summarizeErrMessage(err),
                code: err instanceof MemosError ? err.code : undefined,
                ...extractRetryDiagnostics(err instanceof MemosError ? err.details : undefined),
                at: failAt,
                durationMs: Date.now() - start,
                op: opts?.op ?? "stream",
                episodeId: opts?.episodeId,
                phase: opts?.phase,
            });
            throw err;
        }
    }
    async function callHostFallback(primaryErr, messages, input, opts, op, behavior) {
        const hostProv = new HostLlmProvider();
        const res = await hostProv.complete(messages, input, makeCtx(opts, asProviderLog(rootLogger.child({ channel: "llm.host" }))));
        hostFallbacks++;
        facadeLog.warn("host.fallback", {
            from: provider.name,
            op,
            reason: summarizeErr(primaryErr),
        });
        const completion = {
            text: res.text,
            provider: provider.name,
            model: config.model,
            finishReason: res.finishReason,
            usage: res.usage,
            servedBy: "host_fallback",
            durationMs: res.durationMs,
        };
        record(completion, op, messages);
        // The primary provider is still broken even though the host bridge
        // saved this call. Keep the breaker open for terminal primary
        // errors so later calls can go straight to host fallback without
        // touching the paid provider again.
        const fallbackAt = markFallback(primaryErr);
        if (!behavior.keepBreakerOpen)
            breakerRecordSuccess();
        if (behavior.notifyError)
            notifyOnError(primaryErr);
        notifyStatus({
            status: "fallback",
            provider: provider.name,
            model: config.model,
            message: summarizeErrMessage(primaryErr),
            code: primaryErr instanceof MemosError ? primaryErr.code : undefined,
            ...extractRetryDiagnostics(primaryErr instanceof MemosError ? primaryErr.details : undefined),
            at: fallbackAt,
            durationMs: completion.durationMs,
            fallbackProvider: "host",
            op,
            episodeId: opts?.episodeId,
            phase: opts?.phase,
        });
        return { completion };
    }
    const client = {
        provider: provider.name,
        model: config.model,
        canStream: typeof provider.stream === "function",
        complete,
        completeJson,
        stream,
        stats() {
            return {
                requests,
                hostFallbacks,
                failures,
                retries,
                totalPromptTokens,
                totalCompletionTokens,
                lastOkAt,
                lastFallbackAt,
                lastError,
                circuitOpen: breakerIsOpen(),
                circuitOpenUntil,
                circuitOpenedReason,
            };
        },
        resetStats() {
            requests = 0;
            hostFallbacks = 0;
            failures = 0;
            retries = 0;
            totalPromptTokens = 0;
            totalCompletionTokens = 0;
            lastOkAt = null;
            lastFallbackAt = null;
            lastError = null;
            circuitOpenUntil = null;
            circuitOpenedReason = null;
            lastCircuitOpenStatusAt = null;
        },
        async close() {
            await provider.close?.();
        },
    };
    facadeLog.info("init", {
        provider: provider.name,
        model: config.model,
        temperature: config.temperature,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        fallbackToHost: config.fallbackToHost,
        circuitBreaker: {
            enabled: breakerEnabled,
            cooldownMs: breakerCooldownMs,
        },
    });
    return client;
}
// ─── Provider selection + fallback logic ─────────────────────────────────────
export function makeProviderFor(name) {
    switch (name) {
        case "openai_compatible":
            return new OpenAiLlmProvider();
        case "anthropic":
            return new AnthropicLlmProvider();
        case "gemini":
            return new GeminiLlmProvider();
        case "bedrock":
            return new BedrockLlmProvider();
        case "host":
            return new HostLlmProvider();
        case "local_only":
            return new LocalOnlyLlmProvider();
        default:
            throw new MemosError(ERROR_CODES.UNSUPPORTED, `Unknown llm provider: ${String(name)}`, {
                provider: name,
            });
    }
}
function shouldFallback(err, config, providerName) {
    if (!config.fallbackToHost)
        return false;
    if (providerName === "host")
        return false; // already host
    if (!getHostLlmBridge())
        return false;
    if (!(err instanceof MemosError))
        return false;
    return (err.code === ERROR_CODES.LLM_UNAVAILABLE ||
        err.code === ERROR_CODES.LLM_RATE_LIMITED ||
        err.code === ERROR_CODES.LLM_TIMEOUT);
}
/**
 * Default circuit-breaker classifier for terminal provider errors.
 *
 * A "terminal" error is one that will keep failing until the operator
 * intervenes (top up balance, fix API key, fix model name). Retrying
 * such an error just burns paid quota and pollutes the audit log, so
 * the breaker opens and short-circuits further calls for the cool-
 * down window. Issue #1897 reports the symptom — ~12,900 paid LLM
 * requests in 24 h against a key with insufficient balance.
 *
 * Detection sources, in order:
 *   1. `MemosError(LLM_UNAVAILABLE)` with `details.status` ∈ 401/402/403
 *      — set by `core/llm/fetcher.ts::httpPostJson` for non-ok HTTP
 *      responses.
 *   2. Well-known lowercase phrases in the error message (so providers
 *      that return 400 for "Insufficient Balance" — looking at you,
 *      DeepSeek — are still recognized).
 */
function defaultIsTerminal(err) {
    if (!(err instanceof MemosError))
        return false;
    if (err.code !== ERROR_CODES.LLM_UNAVAILABLE)
        return false;
    const status = Number(err.details?.status);
    if (status === 401 || status === 402 || status === 403)
        return true;
    const msg = (err.message ?? "").toLowerCase();
    return (msg.includes("insufficient balance") ||
        msg.includes("invalid api key") ||
        msg.includes("invalid_api_key") ||
        msg.includes("unauthorized") ||
        msg.includes("account suspended") ||
        msg.includes("billing"));
}
// ─── Logger adapter ──────────────────────────────────────────────────────────
function asProviderLog(log) {
    return {
        trace: (msg, detail) => log.trace(msg, detail),
        debug: (msg, detail) => log.debug(msg, detail),
        info: (msg, detail) => log.info(msg, detail),
        warn: (msg, detail) => log.warn(msg, detail),
        error: (msg, detail) => log.error(msg, detail),
    };
}
function summarizeErr(e) {
    if (e instanceof MemosError)
        return { ...e.toJSON() };
    if (e instanceof Error)
        return { name: e.name, message: e.message };
    return { value: String(e) };
}
function summarizeErrMessage(e) {
    if (e instanceof MemosError)
        return `${e.code}: ${e.message}`;
    if (e instanceof Error)
        return e.message;
    return String(e);
}
//# sourceMappingURL=client.js.map