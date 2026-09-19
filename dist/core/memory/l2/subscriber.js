/**
 * `attachL2Subscriber` — bridge between the reward pipeline and the L2
 * orchestrator.
 *
 * On every `reward.updated` event:
 *   1. Reload the episode's traces (reward.updated only tells us the ids;
 *      we need full rows with fresh V values).
 *   2. Call `runL2` with the pre-wired deps.
 *   3. Surface errors as `l2.failed` on the L2 bus; never throw upstream.
 *
 * Keeping this as an explicit subscriber (rather than shoving it inside the
 * reward runner) means L2 failures never roll back reward writes and we can
 * unit-test the whole pipeline by emitting a fake `reward.updated` event.
 */
import { runL2 } from "./l2.js";
export function attachL2Subscriber(deps) {
    const { rewardBus, log } = deps;
    const subLog = log.child({ channel: "core.memory.l2" });
    let active = 0;
    let closed = false;
    const inflight = new Set();
    const inflightByEpisode = new Map();
    const pendingByEpisode = new Map();
    async function processReward(result) {
        if (closed)
            return;
        active++;
        try {
            const traces = result.traceIds
                .map((id) => deps.repos.traces.getById(id))
                .filter((t) => !!t);
            if (traces.length === 0) {
                subLog.debug("skip.no_traces", { episodeId: result.episodeId });
                return;
            }
            await runL2({
                episodeId: result.episodeId,
                sessionId: result.sessionId,
                traces,
                trigger: "reward.updated",
            }, {
                db: deps.db,
                repos: deps.repos,
                llm: deps.llm,
                log: subLog,
                bus: deps.l2Bus,
                config: deps.config,
                thresholds: deps.thresholds,
            });
        }
        catch (err) {
            subLog.error("run.failed", {
                episodeId: result.episodeId,
                err: err instanceof Error ? { name: err.name, message: err.message } : { value: String(err) },
            });
            deps.l2Bus.emit({
                kind: "l2.failed",
                episodeId: result.episodeId,
                stage: "run",
                error: {
                    code: "L2_RUN_FAILED",
                    message: err instanceof Error ? err.message : String(err),
                },
            });
        }
        finally {
            active--;
        }
    }
    async function processEpisodeQueue(initial) {
        let next = initial;
        while (next && !closed) {
            pendingByEpisode.delete(next.episodeId);
            await processReward(next);
            next = pendingByEpisode.get(next.episodeId);
        }
    }
    function scheduleReward(result) {
        if (closed)
            return;
        const existing = inflightByEpisode.get(result.episodeId);
        if (existing) {
            // Keep only the latest reward snapshot for this episode. OpenClaw
            // can emit several reward.updated events while reflect/lite passes
            // are still settling; serialising them prevents parallel induction
            // over the same candidate buckets while still preserving the newest
            // trace set for a follow-up pass.
            pendingByEpisode.set(result.episodeId, result);
            return;
        }
        const p = processEpisodeQueue(result).finally(() => {
            inflightByEpisode.delete(result.episodeId);
            inflight.delete(p);
        });
        inflightByEpisode.set(result.episodeId, p);
        inflight.add(p);
    }
    const off = rewardBus.on("reward.updated", (evt) => {
        if (evt.kind !== "reward.updated")
            return;
        // Fire-and-forget for the producer (reward subscriber must not
        // block on us), but track/coalesce the promise so `drain()` can wait
        // for the L2 induction to actually finish before the process
        // shuts down.
        scheduleReward(evt.result);
    });
    return {
        detach() {
            closed = true;
            off();
            pendingByEpisode.clear();
        },
        async drain() {
            while (inflight.size > 0) {
                await Promise.all(Array.from(inflight));
            }
        },
        async runOnce(episodeId, opts) {
            const ep = deps.repos.traces; // just to silence TS unused check
            const traces = [];
            const rows = deps.db
                .prepare(`SELECT id FROM traces WHERE episode_id = @episode_id ORDER BY ts ASC`)
                .all({ episode_id: episodeId });
            for (const r of rows) {
                const t = ep.getById(r.id);
                if (t)
                    traces.push(t);
            }
            if (traces.length === 0)
                return;
            await runL2({
                episodeId,
                sessionId: traces[0].sessionId,
                traces,
                trigger: opts?.trigger ?? "manual",
            }, {
                db: deps.db,
                repos: deps.repos,
                llm: deps.llm,
                log: subLog,
                bus: deps.l2Bus,
                config: deps.config,
                thresholds: deps.thresholds,
            });
        },
    };
}
//# sourceMappingURL=subscriber.js.map