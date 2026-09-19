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
import type { CaptureEventBus } from "../capture/index.js";
import type { EpisodeId } from "../types.js";
import type { RewardRunner } from "./reward.js";
import type { RewardConfig, UserFeedback } from "./types.js";
export interface RewardSubscriberOptions {
    feedbackWindowSec?: number;
    /** Called when a background run fails. Receives the original error. */
    onError?: (err: unknown, episodeId: EpisodeId) => void;
}
export interface RewardSubscription {
    /** Submit a feedback row and schedule a run if the episode has one in-flight. */
    submitFeedback(feedback: UserFeedback): void;
    /** Manual trigger — run NOW, regardless of window or feedback. */
    runManually(episodeId: EpisodeId, trigger?: "manual" | "explicit_feedback"): Promise<void>;
    /** Detach from the capture bus. In-flight runs continue. */
    stop(): void;
    /** Wait for every in-flight run to finish. */
    drain(): Promise<void>;
    pendingCount(): number;
}
export declare function attachRewardSubscriber(captureBus: CaptureEventBus, runner: RewardRunner, cfg: RewardConfig, opts?: RewardSubscriberOptions): RewardSubscription;
//# sourceMappingURL=subscriber.d.ts.map