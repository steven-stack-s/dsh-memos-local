/** Parse RFC 9110 Retry-After delay-seconds or HTTP-date into milliseconds. */
export declare const MAX_INLINE_RETRY_DELAY_MS = 30000;
/** @deprecated Use MAX_INLINE_RETRY_DELAY_MS. */
export declare const MAX_RETRY_DELAY_MS = 30000;
export type RetryDeferReason = "deadline_insufficient" | "retry_after_too_long";
export interface RetryPlanBase {
    backoffMs: number;
    delayMs: number;
    retryAfterMs: number | null;
    retryAt: number;
    source: "backoff" | "retry_after";
}
export type RetryPlan = (RetryPlanBase & {
    action: "wait";
}) | (RetryPlanBase & {
    action: "defer";
    reason: RetryDeferReason;
});
export interface RetryCooldown {
    retryAfterMs: number;
    retryAt: number;
    status: number;
}
export interface RetryDiagnosticDetails {
    retryAfterMs?: number;
    retryAt?: number;
    retryDecision?: "wait" | "defer" | "stop";
    retryReason?: string;
}
export declare function parseRetryAfterMs(value: string | null | undefined, nowMs?: number): number | null;
export declare function retryDelayMs(input: {
    attempt: number;
    baseMs: number;
    jitterMaxMs: number;
    retryAfterMs?: number | null;
    maxDelayMs?: number;
    random?: () => number;
}): number;
/**
 * Decide whether a retry can happen inline without violating Retry-After.
 *
 * Provider Retry-After values are never clamped downward. When the earliest
 * legal retry cannot fit the inline wait or request deadline, callers must
 * defer/fallback and carry retryAt into their recovery path.
 */
export declare function planRetry(input: {
    attempt: number;
    baseMs: number;
    jitterMaxMs: number;
    retryAfterMs?: number | null;
    maxInlineDelayMs?: number;
    deadlineAt?: number;
    nowMs?: number;
    random?: () => number;
}): RetryPlan;
export declare function retryCooldownKey(kind: "llm" | "embedding", provider: string, url: string, scope?: string): string;
/** Extend a provider cooldown monotonically; a shorter later response cannot weaken it. */
export declare function recordRetryCooldown(key: string, cooldown: RetryCooldown): void;
export declare function getRetryCooldown(key: string, nowMs?: number): RetryCooldown | null;
/** Test/runtime-reset hook; plugin shutdown does not need to await cooldown state. */
export declare function clearRetryCooldowns(): void;
/** Copy only bounded, machine-readable retry fields from an error detail bag. */
export declare function extractRetryDiagnostics(details: Record<string, unknown> | undefined): RetryDiagnosticDetails;
/** Abortable retry wait so request cancellation and shutdown do not leave sleepers behind. */
export declare function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void>;
//# sourceMappingURL=retry-after.d.ts.map