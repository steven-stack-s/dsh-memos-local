export interface RequestDeadline {
    readonly signal: AbortSignal;
    remainingMs(): number;
    dispose(): void;
}
/**
 * Convert an adapter-provided absolute epoch deadline into one abort signal.
 * The absolute form survives JSON-RPC transport time and prevents every stage
 * from accidentally receiving a fresh timeout budget.
 */
export declare function createRequestDeadline(deadlineAt: number, now?: () => number): RequestDeadline;
//# sourceMappingURL=request-deadline.d.ts.map