/**
 * Local MiniLM embeddings via `@huggingface/transformers`.
 *
 * Model: by default `Xenova/all-MiniLM-L6-v2` — 384-dim, ~23 MB on first run,
 * quantized to int8 for CPU friendliness. The model loads lazily on the first
 * call and is shared across all embedders in the process.
 *
 * Output: `pipeline("feature-extraction")` already supports mean-pooling and
 * L2-normalize via `{ pooling: "mean", normalize: true }`. We intentionally
 * don't normalize again on top of that.
 */
import { homedir, platform } from "node:os";
import { acquireLocalEmbeddingProcess, releaseLocalEmbeddingProcess, } from "./local-process.js";
import { join, resolve } from "node:path";
import { MemosError } from "../../../agent-contract/errors.js";
let extractorPromise = null;
let currentKey = null;
// Transformers has a process-wide env. Keep our differently configured loads
// exclusive until pipeline creation has finished, including background warmup.
let loadQueue = Promise.resolve();
function abortReason(signal) {
    return signal.reason ?? new DOMException("Aborted", "AbortError");
}
/**
 * Stop awaiting native Transformers work when the caller's request expires.
 *
 * The pipeline API does not accept an AbortSignal, so the underlying model
 * load/inference may still finish in the background. Keeping that work alive
 * is intentional: a timed-out first request can still warm the shared model
 * cache for the next request. Attaching both promise handlers also prevents a
 * late native failure from becoming an unhandled rejection.
 */
function awaitWithAbort(promise, signal) {
    if (!signal)
        return promise;
    if (signal.aborted)
        return Promise.reject(abortReason(signal));
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener("abort", onAbort);
            reject(abortReason(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then((value) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
        }, (err) => {
            signal.removeEventListener("abort", onAbort);
            reject(err);
        });
    });
}
function localPath(value) {
    if (!value?.trim())
        return undefined;
    const path = value.trim();
    return resolve(path === "~"
        ? homedir()
        : path.startsWith("~/")
            ? join(homedir(), path.slice(2))
            : path);
}
function localSettings(config) {
    // DSH-fork: when the operator has not picked an endpoint, prefer a reachable
    // mirror over huggingface.co — the latter is frequently unreachable from
    // mainland-China networks, so first-run model download stalls until timeout.
    // Explicit `local.remoteHost` and HF_ENDPOINT always win, and
    // MEMOS_HF_MIRROR_DISABLE=1 restores the upstream default exactly, so
    // upstream and non-DSH users are unaffected.
    const dshMirror = process.env.MEMOS_HF_MIRROR_DISABLE === "1"
        ? undefined
        : process.env.MEMOS_HF_MIRROR?.trim() || "https://hf-mirror.com/";
    let remoteHost = config.local?.remoteHost?.trim() ||
        process.env.HF_ENDPOINT?.trim() ||
        dshMirror ||
        undefined;
    if (remoteHost) {
        try {
            const url = new URL(remoteHost);
            if (!["https:", "http:"].includes(url.protocol) ||
                url.username ||
                url.password ||
                url.search ||
                url.hash)
                throw new Error();
            remoteHost = url.href.endsWith("/") ? url.href : `${url.href}/`;
        }
        catch {
            throw new MemosError("config_invalid", "Local model remoteHost/HF_ENDPOINT must be an HTTP(S) base URL without credentials, query or fragment.");
        }
    }
    // DSH-fork: keep the model cache inside DSH_HOME so a desktop install's
    // models travel with the rest of its state (and so the cache survives a
    // profile reset). Explicit `local.cacheDir` still wins; without DSH_HOME
    // this falls back to upstream's `~/.cache/memos/models`.
    const dshCache = process.env.MEMOS_MODEL_CACHE ||
        (process.env.DSH_HOME
            ? [process.env.DSH_HOME, "memos-plugin", "data", ".model-cache"].join("/")
            : undefined);
    return {
        remoteHost,
        modelPath: localPath(config.local?.modelPath),
        cacheDir: localPath(config.local?.cacheDir) ??
            dshCache ??
            join(homedir(), ".cache", "memos", "models"),
        offline: config.local?.offline === true,
    };
}
function ensureExtractor(config, log) {
    const { model } = config;
    const settings = localSettings(config);
    const key = JSON.stringify([model, settings]);
    if (extractorPromise && currentKey === key)
        return extractorPromise;
    log.info("loading", { model, offline: settings.offline });
    const t0 = Date.now();
    const previous = loadQueue;
    const pending = previous.then(async () => {
        const mod = await import("@huggingface/transformers");
        const pipeline = mod.pipeline;
        const env = mod.env;
        const saved = {
            remoteHost: env.remoteHost,
            localModelPath: env.localModelPath,
            cacheDir: env.cacheDir,
            allowRemoteModels: env.allowRemoteModels,
        };
        if (settings.remoteHost)
            env.remoteHost = settings.remoteHost;
        if (settings.modelPath)
            env.localModelPath = settings.modelPath;
        if (settings.cacheDir)
            env.cacheDir = settings.cacheDir;
        env.allowRemoteModels = !settings.offline;
        const progressByFile = new Map();
        try {
            const ext = (await pipeline("feature-extraction", model, {
                dtype: "q8",
                device: "cpu",
                local_files_only: settings.offline,
                progress_callback: (event) => {
                    if (event.status !== "progress" ||
                        typeof event.progress !== "number" ||
                        !Number.isFinite(event.progress))
                        return;
                    const file = event.file ?? "model";
                    const progress = Math.max(0, Math.min(100, Math.floor(event.progress)));
                    if (progressByFile.get(file) === progress ||
                        (progress < (progressByFile.get(file) ?? -10) + 10 &&
                            progress !== 100))
                        return;
                    progressByFile.set(file, progress);
                    log.info("download.progress", { model, file, progress });
                },
            }));
            log.info("ready", { model, durationMs: Date.now() - t0 });
            return ext;
        }
        finally {
            Object.assign(env, saved);
        }
    });
    const observed = pending.catch((err) => {
        if (extractorPromise === observed) {
            extractorPromise = null;
            currentKey = null;
        }
        log.error("load_failed", {
            model,
            err: { name: err.name, message: err.message },
        });
        throw err;
    });
    loadQueue = observed.then(() => undefined, () => undefined);
    currentKey = key;
    extractorPromise = observed;
    return observed;
}
async function waitForModel(load, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            load,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new MemosError("embedding_unavailable", `Local model loading exceeded ${timeoutMs} ms. Check download progress, configure a mirror or local model directory, then retry. Background loading may still complete.`)), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
export class InProcessLocalEmbeddingProvider {
    name = "local";
    async embed(texts, _role, ctx) {
        const { config, log } = ctx;
        // Avoid starting a costly lazy model load for an already-expired request.
        if (ctx.signal?.aborted)
            throw abortReason(ctx.signal);
        const ext = await awaitWithAbort(waitForModel(ensureExtractor(config, log), config.local?.loadTimeoutMs ?? 120_000), ctx.signal);
        const out = [];
        for (let i = 0; i < texts.length; i++) {
            if (ctx.signal?.aborted)
                throw abortReason(ctx.signal);
            const result = await awaitWithAbort(ext(texts[i], { pooling: "mean", normalize: true }), ctx.signal);
            const arr = result.data;
            if (!arr) {
                throw new Error("[embedding.local] extractor returned no .data");
            }
            out.push(Array.from(arr));
        }
        return out;
    }
    async close() {
        // The transformers pipeline doesn't expose a .close(); GC handles it.
        extractorPromise = null;
        currentKey = null;
    }
}
/** Windows native DLLs must remain outside the host process. */
export class LocalEmbeddingProvider {
    name = "local";
    inProcess = new InProcessLocalEmbeddingProvider();
    isolated;
    embed(texts, role, ctx) {
        if (ctx.signal?.aborted)
            return Promise.reject(abortReason(ctx.signal));
        if (platform() !== "win32")
            return this.inProcess.embed(texts, role, ctx);
        this.isolated ??= acquireLocalEmbeddingProcess();
        return this.isolated.embed(texts, ctx);
    }
    async close() {
        if (this.isolated) {
            releaseLocalEmbeddingProcess(this.isolated);
            this.isolated = undefined;
        }
        else {
            await this.inProcess.close();
        }
    }
}
// Test hook — tests can reset the cached extractor without touching internals.
export function __resetLocalExtractorForTests() {
    extractorPromise = null;
    currentKey = null;
    loadQueue = Promise.resolve();
}
//# sourceMappingURL=local.js.map