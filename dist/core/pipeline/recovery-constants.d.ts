/**
 * Shared string constants for episode recovery reasons.
 *
 * Both `memory-core.ts` (which sets recoveryReason) and `capture.ts`
 * (which checks it) import from here so a rename can't silently
 * break the orphan-skip guard.
 */
export declare const RECOVERY_REASONS: {
    readonly DIRTY_REWARD_RESCORE: "dirty_reward_rescore";
};
export type RecoveryReason = (typeof RECOVERY_REASONS)[keyof typeof RECOVERY_REASONS];
//# sourceMappingURL=recovery-constants.d.ts.map