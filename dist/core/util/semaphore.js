export function createSemaphore(max) {
    const limit = Math.max(1, Math.floor(max));
    let current = 0;
    const waiters = [];
    return {
        async acquire(signal) {
            if (signal?.aborted)
                throw abortError(signal);
            if (current < limit) {
                current++;
                return release;
            }
            return new Promise((resolve, reject) => {
                const waiter = { resolve, reject, signal };
                if (signal) {
                    waiter.onAbort = () => {
                        const index = waiters.indexOf(waiter);
                        if (index >= 0)
                            waiters.splice(index, 1);
                        reject(abortError(signal));
                    };
                    signal.addEventListener("abort", waiter.onAbort, { once: true });
                }
                waiters.push(waiter);
            });
        },
    };
    function release() {
        current = Math.max(0, current - 1);
        const next = waiters.shift();
        if (!next)
            return;
        if (next.signal && next.onAbort) {
            next.signal.removeEventListener("abort", next.onAbort);
        }
        current++;
        next.resolve(release);
    }
}
function abortError(signal) {
    return signal.reason instanceof Error
        ? signal.reason
        : new DOMException("semaphore wait aborted", "AbortError");
}
//# sourceMappingURL=semaphore.js.map