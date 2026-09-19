export const DEFAULT_SKILL_LIFECYCLE_INTERVAL_MS = 60 * 60 * 1000;
/**
 * Periodically runs lightweight Skill lifecycle maintenance without draining
 * the full capture/reward/L2/L3 pipeline. Scheduled failures are isolated so
 * one bad pass cannot permanently stop future maintenance.
 */
export function createSkillLifecycleWorker(deps) {
    const intervalMs = Math.max(1, Math.floor(deps.intervalMs ?? DEFAULT_SKILL_LIFECYCLE_INTERVAL_MS));
    const now = deps.now ?? Date.now;
    let timer = null;
    let running = null;
    let lastStartedAt = Number.NEGATIVE_INFINITY;
    let stopped = true;
    function beginRun() {
        if (running)
            return running;
        lastStartedAt = now();
        const current = Promise.resolve().then(() => deps.runLifecycle()).finally(() => {
            if (running === current)
                running = null;
        });
        running = current;
        return current;
    }
    function trigger() {
        if (stopped || running || now() - lastStartedAt < intervalMs)
            return;
        void beginRun().catch((err) => {
            deps.log.warn("skill.lifecycle_worker.failed", {
                err: err instanceof Error ? err.message : String(err),
            });
        });
    }
    return {
        start() {
            if (!stopped)
                return;
            stopped = false;
            trigger();
            timer = setInterval(trigger, intervalMs);
            timer.unref?.();
        },
        trigger,
        runNow() {
            return beginRun();
        },
        async flush() {
            if (running)
                await running;
        },
        stop() {
            stopped = true;
            if (timer)
                clearInterval(timer);
            timer = null;
        },
    };
}
//# sourceMappingURL=lifecycle-worker.js.map