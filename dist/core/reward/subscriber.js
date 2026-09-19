/**
 * `subscriber` — glue between `core/capture` and `core/reward`.
 *
 * Model:
 *   1. When `capture.done` fires on the capture bus, we start a
 *      "feedback window" for that episode.
 *   2. If explicit feedback arrives inside the window, score immediately
 *      with `trigger="explicit_feedback"`.
 *   3. If the window expires without explicit feedback, fall back to
 *      `trigger="implicit_fallback"` — the human-scorer uses whatever
 *      implicit signals were persisted by the session/feedback classifier.
 *   4. `cfg.feedbackWindowSec = 0` disables the timer entirely; only
 *      `submitFeedback(...)` / `runManually(...)` can trigger a run.
 *
 * This module is intentionally small. Phase 15's pipeline orchestrator
 * can layer on smarter retry / batching; this subscriber is enough for
 * the MVP loop used by integration tests.
 */
import { rootLogger } from "../logger/index.js";
export function attachRewardSubscriber(captureBus, runner, cfg, opts = {}) {
    const log = rootLogger.child({ channel: "core.reward" });
    const windowMs = (opts.feedbackWindowSec ?? cfg.feedbackWindowSec) * 1_000;
    const pending = new Map();
    const inflight = new Set();
    function schedule(episodeId, delayMs) {
        const entry = pending.get(episodeId);
        if (!entry)
            return;
        if (entry.timer)
            clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
            pending.delete(episodeId);
            const feedback = entry.feedback;
            runInBackground(() => runner.run({
                episodeId,
                feedback,
                trigger: feedback.length > 0 ? "explicit_feedback" : "implicit_fallback",
            }));
        }, delayMs);
    }
    function runInBackground(fn) {
        const p = fn()
            .catch((err) => {
            log.error("run.failed", { err: errDetail(err) });
            if (opts.onError)
                opts.onError(err, err.episodeId);
        })
            .finally(() => {
            inflight.delete(p);
        });
        inflight.add(p);
    }
    const unsub = captureBus.on("capture.done", (evt) => {
        if (evt.kind !== "capture.done")
            return;
        const eid = evt.result.episodeId;
        // No traces → nothing to backprop onto. Skip scheduling altogether.
        if (evt.result.traceIds.length === 0) {
            log.debug("skip.empty_capture", { episodeId: eid });
            return;
        }
        // If window is disabled (0s), the subscriber just listens for
        // explicit submitFeedback calls; no auto fallback.
        if (windowMs === 0) {
            pending.set(eid, { episodeId: eid, feedback: [], timer: null });
            return;
        }
        pending.set(eid, { episodeId: eid, feedback: [], timer: null });
        schedule(eid, windowMs);
    });
    return {
        submitFeedback(feedback) {
            const eid = feedback.episodeId;
            const entry = pending.get(eid);
            if (!entry) {
                // No pending capture — run immediately (e.g., late feedback on a
                // previously-closed episode).
                runInBackground(() => runner.run({
                    episodeId: eid,
                    feedback: [feedback],
                    trigger: "explicit_feedback",
                }));
                return;
            }
            entry.feedback.push(feedback);
            // Fire immediately; no point waiting further once we've got explicit
            // feedback.
            if (entry.timer)
                clearTimeout(entry.timer);
            pending.delete(eid);
            runInBackground(() => runner.run({
                episodeId: eid,
                feedback: entry.feedback,
                trigger: "explicit_feedback",
            }));
        },
        async runManually(episodeId, trigger = "manual") {
            const entry = pending.get(episodeId);
            if (entry?.timer)
                clearTimeout(entry.timer);
            pending.delete(episodeId);
            await runner.run({
                episodeId,
                feedback: entry?.feedback ?? [],
                trigger,
            });
        },
        stop() {
            for (const entry of pending.values()) {
                if (entry.timer)
                    clearTimeout(entry.timer);
            }
            pending.clear();
            unsub();
        },
        async drain() {
            // Step 1: kick every still-pending episode immediately. The
            // scheduled `setTimeout` would normally wait `feedbackWindowSec`
            // (default 30 s) before firing the implicit fallback. On
            // process shutdown we don't have 30 s to wait — without this
            // the bridge exits, all timers get GC'd, and the episode
            // permanently has `r_task = null` (which then starves L2 / L3 /
            // Skill induction of any positive evidence).
            const flushed = [];
            for (const entry of pending.values()) {
                if (entry.timer) {
                    clearTimeout(entry.timer);
                    flushed.push(entry);
                }
                else if (entry.feedback.length > 0) {
                    flushed.push(entry);
                }
            }
            pending.clear();
            for (const entry of flushed) {
                runInBackground(() => runner.run({
                    episodeId: entry.episodeId,
                    feedback: entry.feedback,
                    trigger: entry.feedback.length > 0
                        ? "explicit_feedback"
                        : "implicit_fallback",
                }));
            }
            // Step 2: now wait for every in-flight reward computation
            // (including those just kicked above) to settle.
            while (inflight.size > 0) {
                await Promise.all(Array.from(inflight));
            }
        },
        pendingCount() {
            return inflight.size;
        },
    };
}
function errDetail(err) {
    if (err instanceof Error)
        return { name: err.name, message: err.message };
    return { value: String(err) };
}
//# sourceMappingURL=subscriber.js.map