import type { Logger } from "../logger/types.js";
export declare const DEFAULT_SKILL_LIFECYCLE_INTERVAL_MS: number;
export interface SkillLifecycleWorker {
    start(): void;
    trigger(): void;
    runNow(): Promise<void>;
    flush(): Promise<void>;
    stop(): void;
}
export interface SkillLifecycleWorkerDeps {
    runLifecycle(): Promise<void>;
    log: Logger;
    intervalMs?: number;
    now?: () => number;
}
/**
 * Periodically runs lightweight Skill lifecycle maintenance without draining
 * the full capture/reward/L2/L3 pipeline. Scheduled failures are isolated so
 * one bad pass cannot permanently stop future maintenance.
 */
export declare function createSkillLifecycleWorker(deps: SkillLifecycleWorkerDeps): SkillLifecycleWorker;
//# sourceMappingURL=lifecycle-worker.d.ts.map