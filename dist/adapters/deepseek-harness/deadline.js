/** Shared hard deadline for DSH foreground memory work. */
export async function waitForDeepSeekHarnessDeadline(operation, options) {
    const now = options.now ?? (() => Date.now());
    if (options.signal.aborted) {
        void operation.catch(() => undefined);
        throw options.signal.reason ?? new DOMException("DSH operation aborted", "AbortError");
    }
    let timer;
    let onAbort;
    const cutoff = new Promise((_resolve, reject) => {
        const finish = (error) => {
            if (timer !== undefined)
                clearTimeout(timer);
            options.signal.removeEventListener("abort", onAbort);
            reject(error);
        };
        onAbort = () => finish(options.signal.reason ?? new DOMException("DSH operation aborted", "AbortError"));
        options.signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => finish(new DOMException(options.timeoutMessage, "TimeoutError")), Math.max(0, options.deadlineAt - now()));
    });
    try {
        // Promise.race installs rejection handlers on both branches, so a late
        // provider rejection remains observed after DSH has already failed open.
        return await Promise.race([operation, cutoff]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        if (onAbort)
            options.signal.removeEventListener("abort", onAbort);
    }
}
export function isDeepSeekHarnessTimeout(error) {
    return error instanceof DOMException && error.name === "TimeoutError";
}
//# sourceMappingURL=deadline.js.map