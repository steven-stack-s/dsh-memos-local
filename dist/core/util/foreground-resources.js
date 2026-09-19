import { ERROR_CODES, MemosError } from "../../agent-contract/errors.js";
export function createForegroundResources(options = {}) {
    const capacity = Math.max(1, Math.floor(options.embeddingConcurrency ?? 1));
    const maxForegroundBurst = Math.max(1, Math.floor(options.maxForegroundBurst ?? 8));
    const embeddingWaiters = {
        foreground: [],
        background: [],
    };
    const backgroundWaiters = [];
    let embeddingInUse = 0;
    let foregroundActive = 0;
    let foregroundBurst = 0;
    const shutdownController = new AbortController();
    function signalFor(signal) {
        return signal
            ? AbortSignal.any([signal, shutdownController.signal])
            : shutdownController.signal;
    }
    function abortError(signal) {
        return signal?.reason instanceof Error
            ? signal.reason
            : new DOMException("resource wait aborted", "AbortError");
    }
    function removeAbortListener(waiter) {
        if (waiter.signal && waiter.onAbort) {
            waiter.signal.removeEventListener("abort", waiter.onAbort);
        }
    }
    function nextEmbeddingWaiter() {
        const foreground = embeddingWaiters.foreground;
        const background = embeddingWaiters.background;
        if (background.length > 0 &&
            (foreground.length === 0 || foregroundBurst >= maxForegroundBurst)) {
            return { priority: "background", waiter: background.shift() };
        }
        if (foreground.length > 0) {
            return { priority: "foreground", waiter: foreground.shift() };
        }
        if (background.length > 0) {
            return { priority: "background", waiter: background.shift() };
        }
        return null;
    }
    function drainEmbedding() {
        while (embeddingInUse < capacity) {
            const next = nextEmbeddingWaiter();
            if (!next)
                return;
            removeAbortListener(next.waiter);
            embeddingInUse++;
            foregroundBurst = next.priority === "foreground" ? foregroundBurst + 1 : 0;
            next.waiter.resolve(makeEmbeddingRelease());
        }
    }
    function makeEmbeddingRelease() {
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            embeddingInUse--;
            drainEmbedding();
        };
    }
    function acquireEmbedding(priority, signal) {
        signal = signalFor(signal);
        if (signal.aborted)
            return Promise.reject(abortError(signal));
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject, signal };
            if (signal) {
                waiter.onAbort = () => {
                    const queue = embeddingWaiters[priority];
                    const index = queue.indexOf(waiter);
                    if (index >= 0)
                        queue.splice(index, 1);
                    reject(abortError(signal));
                };
                signal.addEventListener("abort", waiter.onAbort, { once: true });
            }
            embeddingWaiters[priority].push(waiter);
            drainEmbedding();
        });
    }
    function drainBackgroundGate() {
        if (foregroundActive > 0)
            return;
        for (const waiter of backgroundWaiters.splice(0)) {
            removeAbortListener(waiter);
            waiter.resolve();
        }
    }
    function enterForeground() {
        foregroundActive++;
        let left = false;
        return () => {
            if (left)
                return;
            left = true;
            foregroundActive--;
            drainBackgroundGate();
        };
    }
    function waitForBackground(signal) {
        signal = signalFor(signal);
        if (signal.aborted)
            return Promise.reject(abortError(signal));
        if (foregroundActive === 0)
            return Promise.resolve();
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject, signal };
            if (signal) {
                waiter.onAbort = () => {
                    const index = backgroundWaiters.indexOf(waiter);
                    if (index >= 0)
                        backgroundWaiters.splice(index, 1);
                    reject(abortError(signal));
                };
                signal.addEventListener("abort", waiter.onAbort, { once: true });
            }
            backgroundWaiters.push(waiter);
        });
    }
    function shutdown(reason = "pipeline shutdown") {
        if (shutdownController.signal.aborted)
            return;
        shutdownController.abort(new DOMException(reason, "AbortError"));
    }
    return {
        shutdownSignal: shutdownController.signal,
        signalFor,
        enterForeground,
        waitForBackground,
        acquireEmbedding,
        shutdown,
    };
}
/**
 * Keep the Embedder contract intact while moving provider round-trips behind
 * the shared priority arbiter. Background batches are deliberately chunked
 * so one enrichment pass cannot monopolize the provider for an entire queue.
 */
export function prioritizeEmbedder(inner, resources, priority, backgroundChunkSize = 8) {
    if (!inner)
        return null;
    async function embedOne(input, options) {
        const signal = resources.signalFor(options?.signal);
        const callOptions = { ...options, signal };
        if (priority === "background")
            await resources.waitForBackground(signal);
        const release = await resources.acquireEmbedding(priority, signal);
        try {
            return await inner.embedOne(input, callOptions);
        }
        finally {
            release();
        }
    }
    async function embedMany(inputs, options) {
        const signal = resources.signalFor(options?.signal);
        const callOptions = { ...options, signal };
        if (priority === "foreground" || inputs.length <= backgroundChunkSize) {
            if (priority === "background")
                await resources.waitForBackground(signal);
            const release = await resources.acquireEmbedding(priority, signal);
            try {
                return await inner.embedMany(inputs, callOptions);
            }
            finally {
                release();
            }
        }
        const results = [];
        for (let start = 0; start < inputs.length; start += backgroundChunkSize) {
            await resources.waitForBackground(signal);
            const release = await resources.acquireEmbedding(priority, signal);
            try {
                results.push(...await inner.embedMany(inputs.slice(start, start + backgroundChunkSize), callOptions));
            }
            finally {
                release();
            }
        }
        return results;
    }
    async function embedManySettled(inputs, options) {
        const signal = resources.signalFor(options?.signal);
        const callOptions = { ...options, signal };
        const run = async (slice) => {
            if (inner.embedManySettled)
                return await inner.embedManySettled(slice, callOptions);
            try {
                return (await inner.embedMany(slice, callOptions)).map((vector) => ({
                    ok: true,
                    vector,
                }));
            }
            catch (err) {
                const error = err instanceof MemosError
                    ? err
                    : new MemosError(ERROR_CODES.EMBEDDING_UNAVAILABLE, `legacy embedMany failed: ${err instanceof Error ? err.message : String(err)}`);
                return slice.map(() => ({ ok: false, error }));
            }
        };
        if (priority === "foreground" || inputs.length <= backgroundChunkSize) {
            if (priority === "background")
                await resources.waitForBackground(signal);
            const release = await resources.acquireEmbedding(priority, signal);
            try {
                return await run(inputs);
            }
            finally {
                release();
            }
        }
        const results = [];
        for (let start = 0; start < inputs.length; start += backgroundChunkSize) {
            await resources.waitForBackground(signal);
            const release = await resources.acquireEmbedding(priority, signal);
            try {
                results.push(...await run(inputs.slice(start, start + backgroundChunkSize)));
            }
            finally {
                release();
            }
        }
        return results;
    }
    return {
        get dimensions() {
            return inner.dimensions;
        },
        get provider() {
            return inner.provider;
        },
        get model() {
            return inner.model;
        },
        embedOne,
        embedMany,
        embedManySettled,
        stats: () => inner.stats(),
        resetCache: () => inner.resetCache(),
        close: () => inner.close(),
    };
}
//# sourceMappingURL=foreground-resources.js.map