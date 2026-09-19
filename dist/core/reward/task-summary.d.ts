/**
 * `task-summary` — builds the compact "what the agent tried to do" blurb
 * that the R_human scorer feeds to the LLM.
 *
 * V7 §0.6 scoring anchor: when a single episode spans multiple user
 * turns (the `merge_follow_ups` mode, default), the goal is NOT just
 * the first user message. Each follow-up is its own sub-goal the
 * agent has to address; the scorer needs the full chain to judge
 * whether the agent tracked the user's evolving intent. The previous
 * build pinned `USER_QUERY` to only the first user turn, which caused
 * multi-topic episodes (e.g. 上海天气 → 穿衣 → 带伞 → 北京天气) to be
 * marked as R<0 just because the final assistant reply did not match
 * the *opening* query — a false negative that kept real tasks out of
 * the L2/Skill pipeline.
 *
 * So we now emit a chronological USER_ASKS / AGENT_REPLIES block
 * covering every user turn paired with the agent's corresponding reply
 * (plus a per-step action summary for tool-call context). The scorer's
 * rubric is updated in parallel to judge "did the agent address every
 * user ask, especially the most recent one?" — see
 * `core/llm/prompts/reward.ts`.
 *
 * The result is clipped to `cfg.summaryMaxChars` with a head+tail
 * strategy — identical to `capture/normalizer.ts` — so the most recent
 * user↔agent exchange survives truncation (we keep the tail because
 * "did it end well?" matters most).
 */
import type { TraceRow } from "../types.js";
import type { EpisodeSnapshot } from "../session/types.js";
import type { RewardConfig, TaskSummary } from "./types.js";
export interface SummaryInput {
    episode: EpisodeSnapshot;
    traces: readonly TraceRow[];
    cfg: Pick<RewardConfig, "summaryMaxChars">;
    evaluator?: {
        reflectionProvider?: string;
        reflectionModel?: string;
        scorerProvider?: string;
        scorerModel?: string;
    };
}
export declare function buildTaskSummary(input: SummaryInput): TaskSummary;
//# sourceMappingURL=task-summary.d.ts.map