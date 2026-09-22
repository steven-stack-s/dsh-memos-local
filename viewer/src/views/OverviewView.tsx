/**
 * Overview view — at-a-glance system health + live activity stream.
 *
 * Top row = quantity cards for the four memory layers the algorithm
 * exposes (L1 memories, tasks/episodes, L2 experiences, L3
 * environment knowledge, skills). We pull numbers from
 * `/api/v1/overview` which aggregates `listTraces / listEpisodes /
 * listPolicies / listWorldModels / listSkills`.
 *
 * Second row = the three model slots (LLM, embedder, skill evolver).
 * Each card shows the **configured model name** (not the provider
 * family) because end users pick a model, not a provider — e.g.
 * "gpt-4.1-mini", not "openai_compatible". When the skill evolver
 * inherits from the main LLM we say so explicitly.
 *
 * Third row = live activity dashboard. Six per-category tiles
 * (memory / experience / environment knowledge / skill / retrieval /
 * feedback) each showing a selected-window event count, sparkline, and the
 * most recent event in plain language. Tiles are bucketed off the
 * same SSE buffer (`recent`) we already maintain. See
 * `views/overview/ActivityDashboard.tsx` for the renderer and
 * `views/overview/event-meta.ts` for the event-type → tile mapping.
 */
import { useEffect, useState } from "preact/hooks";
import { api } from "../api/client";
import { openSse } from "../api/sse";
import { health } from "../stores/health";
import { t } from "../stores/i18n";
import { navigate } from "../stores/router";
import type { ApiLogDTO, CoreEvent, CoreEventType } from "../api/types";
import { ActivityDashboard } from "./overview/ActivityDashboard";
import {
  ACTIVITY_WINDOWS, readActivityWindow, saveActivityWindow,
  retainActivityEvents, loadActivityLogs, type ActivityLogPage,
} from "./overview/activity-window";
import {
  displayModelName,
  formatModelStatusLine,
  modelScalarText,
  modelStatusFromInfo,
  type ModelInfo,
} from "./overview/model-status";

interface SkillStats {
  total: number;
  active: number;
  candidate: number;
  archived: number;
}
interface PolicyStats {
  total: number;
  active: number;
  candidate: number;
  archived: number;
}
interface OverviewSummary {
  ok?: boolean;
  version?: string;
  episodes?: number;
  traces?: number;
  skills?: SkillStats;
  policies?: PolicyStats;
  worldModels?: number;
  llm?: ModelInfo;
  embedder?: ModelInfo;
  skillEvolver?: ModelInfo;
}

export function OverviewView() {
  const [summary, setSummary] = useState<OverviewSummary | null>(null);
  const [recent, setRecent] = useState<CoreEvent[]>([]);
  const [recentApiLogEvents, setRecentApiLogEvents] = useState<CoreEvent[]>([]);
  const [activityWindow, setActivityWindow] = useState(readActivityWindow);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "partial" | "error">("loading");

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      api
        .get<OverviewSummary>("/api/v1/overview", { signal: ctrl.signal })
        .then(setSummary)
        .catch(() => void 0);
    void load();
    // Re-poll every 20s so the numbers drift as the agent runs.
    const id = window.setInterval(load, 20_000);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    // Keep the largest selectable window, including across shorter selections.
    const handle = openSse("/api/v1/events", (_, data) => {
      try {
        const evt = JSON.parse(data) as CoreEvent;
        setRecent((prev) => retainActivityEvents([evt, ...prev], Date.now()));
      } catch {
        /* skip */
      }
    });
    return () => handle.close();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading || ctrl.signal.aborted) return;
      loading = true;
      try {
        const res = await loadActivityLogs(
          (offset) => api.get<ActivityLogPage>(`/api/v1/api-logs?limit=500&offset=${offset}`, { signal: ctrl.signal }),
          Date.now(),
        );
        if (ctrl.signal.aborted) return;
        setRecentApiLogEvents(res.logs.map(apiLogToCoreEvent).filter((evt): evt is CoreEvent => evt !== null));
        setHistoryStatus(res.truncated ? "partial" : "ready");
      } catch {
        if (!ctrl.signal.aborted) setHistoryStatus("error");
      } finally {
        loading = false;
      }
    };
    void load();
    // api_logs is the durable source behind the Logs page. Polling it
    // keeps the overview heartbeat alive even when the volatile CoreEvent
    // SSE stream misses a lifecycle event or the viewer connects late.
    const id = window.setInterval(load, 10_000);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  const h = health.value;
  const skills = summary?.skills;
  const policies = summary?.policies;
  // Prefer summary model info (freshly aggregated) and fall back to the
  // health ping for first-paint before `/api/v1/overview` resolves.
  const llm = summary?.llm ?? h?.llm;
  const embedder = summary?.embedder ?? h?.embedder;
  const skillEvolver = summary?.skillEvolver ?? h?.skillEvolver;

  return (
    <>
      <div class="view-header">
        <div class="view-header__title">
          <h1>{t("overview.title")}</h1>
        </div>
      </div>

      {/*
       * Row 1: layer quantities — every card is clickable and jumps to
       * the matching sidebar destination. Order matches the V7 algorithm
       * pyramid (memories → tasks → skills → experiences → environment
       * knowledge), so users see the same flow they read about in the
       * docs and the sidebar.
       */}
      {/*
       * Row 1: layer quantities — every card reserves the same
       * hint-line slot (even when empty) so the numbers line up on a
       * single baseline across the row. Without that reservation the
       * cards without hints were ~16px shorter and their values
       * floated up.
       */}
      <section class="metric-grid">
        <QuantityCard
          label={t("overview.metric.memories")}
          value={summary?.traces}
          onClick={() => navigate("/memories")}
        />
        <QuantityCard
          label={t("overview.metric.episodes")}
          value={summary?.episodes}
          onClick={() => navigate("/tasks")}
        />
        <QuantityCard
          label={t("overview.metric.skills")}
          value={skills?.total}
          hint={
            skills
              ? t("overview.metric.skills.breakdown", {
                  active: skills.active,
                  candidate: skills.candidate,
                })
              : undefined
          }
          onClick={() => navigate("/skills")}
        />
        <QuantityCard
          label={t("overview.metric.policies")}
          value={policies?.total}
          hint={
            policies
              ? t("overview.metric.policies.breakdown", {
                  active: policies.active,
                  candidate: policies.candidate,
                })
              : undefined
          }
          onClick={() => navigate("/policies")}
        />
        <QuantityCard
          label={t("overview.metric.worldModels")}
          value={summary?.worldModels}
          onClick={() => navigate("/world-models")}
        />
      </section>

      {/*
       * Row 2: model slots — show the actual model name. Each card
       * navigates to Settings → AI models so users can quickly jump from
       * "what's running" to "where to change it".
       */}
      <section class="metric-grid">
        <ModelCard
          label={t("overview.metric.embedder")}
          info={embedder}
          onClick={() => navigate("/settings", { tab: "models" })}
        />
        <ModelCard
          label={t("overview.metric.llm")}
          info={llm}
          onClick={() => navigate("/settings", { tab: "models" })}
        />
        <ModelCard
          label={t("overview.metric.skillEvolver")}
          info={skillEvolver}
          hint={
            skillEvolver?.inherited
              ? t("overview.metric.skillEvolver.inherit")
              : undefined
          }
          onClick={() => navigate("/settings", { tab: "models" })}
        />
      </section>

      {/*
       * Row 3: live activity dashboard. Replaces the previous JSON
       * `.stream` block with a 3 × 2 grid of category tiles
       * (memory / experience / environment knowledge / skill /
       * retrieval / feedback) each showing a selected-window sparkline plus
       * the latest event in plain language. The component owns its
       * own clock tick so sparklines slide left even while the SSE
       * stream is quiet.
       */}
      <section class="card card--flat">
        <div class="card__header" style={{ flexWrap: "wrap", gap: "12px" }}>
          <h3 class="card__title">{t("overview.live.title")}</h3>
          <div class="segmented" role="group" aria-label={t("overview.live.window.label")}>
            {ACTIVITY_WINDOWS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                class="segmented__item"
                aria-pressed={activityWindow === minutes}
                onClick={() => {
                  setActivityWindow(minutes);
                  saveActivityWindow(minutes);
                }}
              >
                {minutes === 60 ? t("overview.live.window.hour") : t("overview.live.window.minutes", { n: minutes })}
              </button>
            ))}
          </div>
        </div>
        <p class="muted" style={{ fontSize: "var(--fs-xs)", margin: "0 0 12px" }} role="status">
          {t("overview.live.coverage")}
          {historyStatus !== "ready" && ` ${t(`overview.live.history.${historyStatus}`)}`}
        </p>
        <ActivityDashboard events={retainActivityEvents([...recentApiLogEvents, ...recent], Date.now())} minutes={activityWindow} />
      </section>
    </>
  );
}

function apiLogToCoreEvent(log: ApiLogDTO): CoreEvent | null {
  const output = parseJsonObject(log.outputJson);
  const input = parseJsonObject(log.inputJson);
  const basePayload = {
    apiLogId: log.id,
    toolName: log.toolName,
    success: log.success,
    durationMs: log.durationMs,
    input,
    output,
  };
  const type = apiLogEventType(log, output);
  if (!type) return null;
  return {
    type,
    ts: log.calledAt,
    seq: -1_000_000 - log.id,
    correlationId: apiLogCorrelationId(log, input, output),
    payload: apiLogPayload(log, type, basePayload, input, output),
  };
}

function apiLogEventType(
  log: ApiLogDTO,
  output: Record<string, unknown>,
): CoreEventType | null {
  switch (log.toolName) {
    case "memory_add":
      return "trace.created";
    case "memos_search":
    case "memory_search":
      return hasRetrievalHits(output) ? "retrieval.tier1.hit" : "retrieval.empty";
    case "policy_generate":
      return "l2.induced";
    case "policy_evolve":
      return "l2.revised";
    case "world_model_generate":
      return "l3.abstracted";
    case "world_model_evolve":
      return "l3.revised";
    case "skill_generate":
      return "skill.crystallized";
    case "skill_evolve":
      return skillEventType(output);
    default:
      return null;
  }
}

function skillEventType(output: Record<string, unknown>): CoreEventType {
  const kind = stringField(output, "kind");
  if (kind === "skill.archived") return "skill.archived";
  if (kind === "skill.eta.updated") return "skill.eta_updated";
  return "skill.repaired";
}

function apiLogCorrelationId(
  log: ApiLogDTO,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): string {
  return (
    stringField(output, "traceId") ??
    stringField(output, "policyId") ??
    stringField(output, "worldModelId") ??
    stringField(output, "skillId") ??
    stringField(input, "episodeId") ??
    stringField(input, "sessionId") ??
    `api-log-${log.id}`
  );
}

function apiLogPayload(
  log: ApiLogDTO,
  type: CoreEventType,
  basePayload: Record<string, unknown>,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): Record<string, unknown> {
  if (type === "trace.created") {
    const details = Array.isArray(output.details) ? output.details : [];
    const firstDetail =
      details.find((item): item is Record<string, unknown> => !!item && typeof item === "object") ??
      {};
    return {
      ...basePayload,
      traceId: stringField(firstDetail, "traceId") ?? `api-log-${log.id}`,
      episodeId: stringField(input, "episodeId"),
      sessionId: stringField(input, "sessionId"),
    };
  }
  if (type === "retrieval.tier1.hit" || type === "retrieval.empty") {
    const hits = retrievalHitCount(output);
    return {
      ...basePayload,
      sessionId: stringField(input, "sessionId"),
      episodeId: stringField(input, "episodeId"),
      stats: {
        hits,
        latencyMs: log.durationMs,
      },
    };
  }
  return {
    ...basePayload,
    policyId: stringField(output, "policyId") ?? stringField(input, "policyId"),
    worldModelId: stringField(output, "worldModelId") ?? stringField(input, "worldModelId"),
    skillId: stringField(output, "skillId") ?? stringField(input, "skillId"),
    episodeId: stringField(output, "episodeId") ?? stringField(input, "episodeId"),
    signature: stringField(output, "title") ?? stringField(input, "title"),
  };
}

function hasRetrievalHits(output: Record<string, unknown>): boolean {
  return retrievalHitCount(output) > 0;
}

function retrievalHitCount(output: Record<string, unknown>): number {
  const filtered = Array.isArray(output.filtered) ? output.filtered.length : 0;
  const candidates = Array.isArray(output.candidates) ? output.candidates.length : 0;
  return filtered || candidates;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function QuantityCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      class="metric metric--clickable"
      onClick={onClick}
      aria-label={label}
    >
      <div class="metric__label">{label}</div>
      <div class="metric__value">{value == null ? "—" : value}</div>
      {/*
       * Always render the hint slot so every card in a row has the
       * same vertical rhythm — the value baseline lines up across
       * sibling cards even when some have hints and others don't.
       * Non-breaking space keeps the line height when empty.
       */}
      <div class="metric__delta">{hint ?? "\u00a0"}</div>
    </button>
  );
}

function ModelCard({
  label,
  info,
  hint,
  onClick,
}: {
  label: string;
  info: ModelInfo | undefined;
  hint?: string;
  onClick?: () => void;
}) {
  // `displayModelName` owns the placeholder rules: a host-managed slot has
  // no model name by design and must not read as "not configured".
  const model = modelScalarText(info?.model).trim();
  const display = displayModelName(info);
  const status = modelStatusFromInfo(info);
  const titleAttr = status.tooltip
    ? `${model || label}\n\n${status.tooltip}`
    : model || label;
  return (
    <button
      type="button"
      class="metric metric--clickable"
      onClick={onClick}
      aria-label={label}
      title={titleAttr}
    >
      <div
        class="metric__label"
        style="display:flex;align-items:center;gap:6px;justify-content:center"
      >
        <span class={`status-dot status-dot--${status.kind}`} aria-hidden="true" />
        {label}
      </div>
      <div
        class="metric__value"
        style="font-size:var(--fs-lg);font-family:var(--font-mono, monospace);word-break:break-all"
        title={model || label}
      >
        {display}
      </div>
      <div class="metric__delta">
        {formatModelStatusLine(status.label, hint, info?.provider)}
      </div>
    </button>
  );
}
