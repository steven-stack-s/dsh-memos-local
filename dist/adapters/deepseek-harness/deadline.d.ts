/** Shared hard deadline for DSH foreground memory work. */
export declare function waitForDeepSeekHarnessDeadline<T>(operation: Promise<T>, options: {
    deadlineAt: number;
    signal: AbortSignal;
    now?: () => number;
    timeoutMessage: string;
}): Promise<T>;
export declare function isDeepSeekHarnessTimeout(error: unknown): boolean;
//# sourceMappingURL=deadline.d.ts.map