/**
 * Convert an adapter-provided absolute epoch deadline into one abort signal.
 * The absolute form survives JSON-RPC transport time and prevents every stage
 * from accidentally receiving a fresh timeout budget.
 */
export function createRequestDeadline(deadlineAt, now = Date.now) {
    const controller = new AbortController();
    const remainingMs = () => Math.max(0, deadlineAt - now());
    const initialRemaining = remainingMs();
    let timer = null;
    if (!Number.isFinite(deadlineAt) || initialRemaining <= 0) {
        controller.abort(new DOMException("request deadline exceeded", "TimeoutError"));
    }
    else {
        timer = setTimeout(() => {
            controller.abort(new DOMException("request deadline exceeded", "TimeoutError"));
        }, initialRemaining);
    }
    return {
        signal: controller.signal,
        remainingMs,
        dispose() {
            if (timer)
                clearTimeout(timer);
            timer = null;
        },
    };
}
//# sourceMappingURL=request-deadline.js.map