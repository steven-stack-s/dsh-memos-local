/**
 * Wrap an LLM client so expensive background subscribers share one
 * process-wide concurrency budget without changing call-site semantics.
 */
export function rateLimitLlmClient(client, semaphore, resources) {
    if (!client)
        return null;
    return new RateLimitedLlmClient(client, semaphore, resources);
}
class RateLimitedLlmClient {
    inner;
    semaphore;
    resources;
    constructor(inner, semaphore, resources) {
        this.inner = inner;
        this.semaphore = semaphore;
        this.resources = resources;
    }
    get provider() {
        return this.inner.provider;
    }
    get model() {
        return this.inner.model;
    }
    get canStream() {
        return this.inner.canStream;
    }
    async complete(messages, opts) {
        const signal = this.resources?.signalFor(opts?.signal) ?? opts?.signal;
        const callOpts = signal ? { ...opts, signal } : opts;
        await this.resources?.waitForBackground(signal);
        const release = await this.semaphore.acquire(signal);
        try {
            return await this.inner.complete(messages, callOpts);
        }
        finally {
            release();
        }
    }
    async completeJson(messages, opts) {
        const signal = this.resources?.signalFor(opts?.signal) ?? opts?.signal;
        const callOpts = signal ? { ...opts, signal } : opts;
        await this.resources?.waitForBackground(signal);
        const release = await this.semaphore.acquire(signal);
        try {
            return await this.inner.completeJson(messages, callOpts);
        }
        finally {
            release();
        }
    }
    async *stream(messages, opts) {
        const signal = this.resources?.signalFor(opts?.signal) ?? opts?.signal;
        const callOpts = signal ? { ...opts, signal } : opts;
        await this.resources?.waitForBackground(signal);
        const release = await this.semaphore.acquire(signal);
        try {
            yield* this.inner.stream(messages, callOpts);
        }
        finally {
            release();
        }
    }
    stats() {
        return this.inner.stats();
    }
    resetStats() {
        this.inner.resetStats();
    }
    close() {
        return this.inner.close();
    }
}
//# sourceMappingURL=rate-limited-llm.js.map