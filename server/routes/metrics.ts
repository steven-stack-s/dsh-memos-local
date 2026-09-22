/**
 * Analytics endpoints.
 *
 *   GET /api/v1/metrics?days=N
 *     High-level KPIs (totals, daily histogram). Thin adapter over
 *     `core.metrics()`.
 *
 *   GET /api/v1/metrics/tools?minutes=N  (alias: ?days=N)
 *     Per-tool call latency + success-rate table. Data source: the
 *     `api_logs` table, which records every plugin internal operation
 *     (memos_search / memory_add / policy_generate / skill_generate /
 *     world_model_generate / task_done / task_failed) with its
 *     `durationMs` and `success` flag. We also fold in any agent-side
 *     tool invocations recorded on `traces.tool_calls_json` so the
 *     panel covers both plugin subsystems and external tools.
 *
 *     Output shape mirrors the legacy `memos-local-openclaw` plugin so
 *     the frontend `ToolLatencyCard` can consume it unchanged.
 *
 *     Aggregation happens in SQL over the requested window. It used to pull
 *     a page of rows through `listApiLogs` and roll them up in JS, but that
 *     method hard-caps at 500 rows — so a 24h/7d/30d window was silently
 *     computed from roughly the last hour of data. On a 12k-row table the
 *     30d view reported 12 calls where the truth was 574 (a 98% under-count)
 *     and every window beyond 1h looked identical.
 */
import type { ServerDeps } from "../types.js";
import { latencySummary, MIN_SAMPLES_FOR_PERCENTILE } from "../../core/util/percentile.js";
import type { Routes } from "./registry.js";

interface ToolStat {
  name: string;
  calls: number;
  errors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  lastTs: number;
  /**
   * False when `calls` is below `MIN_SAMPLES_FOR_PERCENTILE`, i.e. the
   * percentiles are not statistically meaningful (p95 of one call is just
   * that call). The UI uses this to avoid drawing a full-width bar for a
   * single observation.
   */
  enoughSamples: boolean;
}

interface UnavailableToolStat {
  name: string;
  calls: number;
  errors: number;
  lastTs: number;
}

export function registerMetricsRoutes(routes: Routes, deps: ServerDeps): void {
  routes.set("GET /api/v1/metrics", async (ctx) => {
    const raw = ctx.url.searchParams.get("days");
    const days = raw ? Number(raw) : undefined;
    // Viewer analytics cover the whole local database — see overview.ts
    // for why viewer reads must not follow the turn-scoped namespace.
    return await deps.core.metrics({
      days: Number.isFinite(days) ? days : undefined,
      includeAllNamespaces: true,
    });
  });

  routes.set("GET /api/v1/metrics/tools", async (ctx) => {
    const params = ctx.url.searchParams;
    // Prefer `minutes` (legacy viewer used that unit); fall back to
    // `days` for back-compat. Clamp 1 minute — 30 days.
    const rawMinutes = Number(params.get("minutes"));
    const rawDays = Number(params.get("days"));
    const windowMinutes = Number.isFinite(rawMinutes) && rawMinutes > 0
      ? Math.min(30 * 24 * 60, rawMinutes)
      : Number.isFinite(rawDays) && rawDays > 0
      ? Math.min(30 * 24 * 60, rawDays * 24 * 60)
      : 24 * 60; // default 24h
    const sinceMs = Date.now() - windowMinutes * 60 * 1000;

    const wantSeries = params.get("series") === "true";
    const buckets = new Map<string, number[]>();
    const errors = new Map<string, number>();
    const lastTs = new Map<string, number>();
    const unavailableCalls = new Map<string, number>();
    const unavailableErrors = new Map<string, number>();
    const unavailableLastTs = new Map<string, number>();
    // Per-minute time series keyed by "YYYY-MM-DDTHH:MM" → { [tool]: ms[] }
    const minuteBuckets = new Map<string, Map<string, number[]>>();

    /**
     * Record a tool's rollup directly, bypassing the raw-duration bucket.
     *
     * `counts` / `errors` / `avgMs` come from SQL and cover the whole
     * window; `durationsMs` is only the (capped) sample used to derive
     * percentiles. Mixing the two would double-count, so aggregates are
     * stored separately from `buckets` and merged at the end.
     */
    const aggregates = new Map<
      string,
      { calls: number; errors: number; avgMs: number; durations: number[]; lastTs: number }
    >();
    const bumpSamples = (
      name: string,
      durations: readonly number[],
      calls: number,
      errCount: number,
      avgMs: number,
      ts: number,
    ): void => {
      const prev = aggregates.get(name);
      aggregates.set(name, {
        calls: (prev?.calls ?? 0) + calls,
        errors: (prev?.errors ?? 0) + errCount,
        // Weighted so a future second source merges correctly.
        avgMs: prev && prev.calls + calls > 0
          ? (prev.avgMs * prev.calls + avgMs * calls) / (prev.calls + calls)
          : avgMs,
        durations: [...(prev?.durations ?? []), ...durations],
        lastTs: Math.max(prev?.lastTs ?? 0, ts),
      });
    };

    const bump = (name: string, durMs: number, ok: boolean, ts: number): void => {
      if (!buckets.has(name)) buckets.set(name, []);
      buckets.get(name)!.push(Math.max(0, durMs));
      if (!ok) errors.set(name, (errors.get(name) ?? 0) + 1);
      lastTs.set(name, Math.max(lastTs.get(name) ?? 0, ts));
      if (wantSeries) {
        const d = new Date(ts);
        const minute = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        if (!minuteBuckets.has(minute)) minuteBuckets.set(minute, new Map());
        const mb = minuteBuckets.get(minute)!;
        if (!mb.has(name)) mb.set(name, []);
        mb.get(name)!.push(Math.max(0, durMs));
      }
    };

    const bumpUnavailable = (name: string, ok: boolean, ts: number): void => {
      unavailableCalls.set(name, (unavailableCalls.get(name) ?? 0) + 1);
      if (!ok) unavailableErrors.set(name, (unavailableErrors.get(name) ?? 0) + 1);
      unavailableLastTs.set(name, Math.max(unavailableLastTs.get(name) ?? 0, ts));
    };

    // 1. Plugin internal operations — from api_logs. We only surface
    // entries that represent **actual tool/handler calls the agent
    // made or the user cares about latency for**: `memos_search`
    // and `memory_add`. Purely internal pipeline lifecycle events
    // (`task_done`, `task_failed`, `skill_generate`, `skill_evolve`,
    // `policy_generate`, `policy_evolve`, `world_model_generate`,
    // `world_model_evolve`) are skipped — they clutter the chart
    // with names like "task_failed" that users don't recognise as
    // tools, and their timings reflect background work rather than
    // response latency.
    const PUBLIC_API_LOG_TOOLS = ["memos_search", "memory_search", "memory_add"] as const;
    // Aggregate in SQL over the window rather than paging rows into JS.
    // `listApiLogs` clamps to 500 rows, which silently truncated every
    // window beyond ~1h (see the file header). The repo method returns the
    // full per-tool counts plus a newest-first duration sample for the
    // percentiles, so the numbers no longer depend on any page limit.
    const apiLogAggregates = await deps.core.aggregateApiLogsByTool({
      since: sinceMs,
      toolNames: PUBLIC_API_LOG_TOOLS,
      maxDurationsPerTool: 2_000,
    });
    for (const agg of apiLogAggregates) {
      bumpSamples(
        agg.toolName,
        agg.durationsMs,
        agg.calls,
        agg.errors,
        agg.avgMs,
        agg.lastTs,
      );
    }

    // 2. External tool calls embedded in traces — covers bash / grep /
    // web / whatever the agent ran. Fold them in with the api_logs
    // rows so the panel answers "is anything slow?" regardless of
    // whether the slowness was internal or user-visible.
    const traces = await deps.core.listTraces({ limit: 2_000, offset: 0, includeAllNamespaces: true });
    for (const tr of traces) {
      if (tr.ts < sinceMs) continue;
      for (const tc of tr.toolCalls ?? []) {
        const name = tc.name ?? "unknown";
        const startedAt = tc.startedAt;
        const endedAt = tc.endedAt;
        if (
          typeof startedAt !== "number" ||
          typeof endedAt !== "number" ||
          !Number.isFinite(startedAt) ||
          !Number.isFinite(endedAt) ||
          endedAt <= startedAt
        ) {
          bumpUnavailable(name, !tc.errorCode, tr.ts);
          continue;
        }
        const dur = endedAt - startedAt;
        bump(name, dur, !tc.errorCode, endedAt);
      }
    }

    const tools: ToolStat[] = [];

    // (a) Tools whose counts came from SQL (`api_logs`). `calls`, `errors`
    //     and `avgMs` are authoritative — they cover the full window. Only
    //     the percentile *sample* is capped, which is fine and is why
    //     `enoughSamples` is carried through to the UI.
    for (const [name, agg] of aggregates) {
      // Fold in any trace-derived observations for the same tool so the
      // panel still shows one row per tool rather than two.
      const extra = buckets.get(name) ?? [];
      const sample = [...agg.durations, ...extra].sort((a, b) => a - b);
      const calls = agg.calls + extra.length;
      const summary = latencySummary(sample, calls);
      tools.push({
        name,
        calls,
        errors: agg.errors + (errors.get(name) ?? 0),
        avgMs: Math.round(
          calls > 0
            ? (agg.avgMs * agg.calls +
                extra.reduce((s, v) => s + v, 0)) / calls
            : 0,
        ),
        p50Ms: Math.round(summary.p50Ms),
        p95Ms: Math.round(summary.p95Ms),
        lastTs: Math.max(agg.lastTs, lastTs.get(name) ?? 0),
        enoughSamples: summary.enoughSamples,
      });
    }

    // (b) Tools that only appeared in traces (bash / grep / web / …).
    for (const [name, durs] of buckets) {
      if (aggregates.has(name)) continue;
      durs.sort((a, b) => a - b);
      const n = durs.length;
      // Percentiles come from `percentile()` (linear interpolation). The
      // previous inline `durs[floor(n * q)]` returned the MAXIMUM for
      // n = 2 and collapsed p50/p95 onto the single sample for n = 1.
      const summary = latencySummary(durs, n);
      tools.push({
        name,
        calls: n,
        errors: errors.get(name) ?? 0,
        avgMs: Math.round(summary.avgMs),
        p50Ms: Math.round(summary.p50Ms),
        p95Ms: Math.round(summary.p95Ms),
        lastTs: lastTs.get(name) ?? 0,
        enoughSamples: summary.enoughSamples,
      });
    }
    tools.sort((a, b) => b.calls - a.calls);
    const toolNames = tools.map((t) => t.name);

    const unavailableTools: UnavailableToolStat[] = [...unavailableCalls.entries()]
      .map(([name, calls]) => ({
        name,
        calls,
        errors: unavailableErrors.get(name) ?? 0,
        lastTs: unavailableLastTs.get(name) ?? 0,
      }))
      .sort((a, b) => b.calls - a.calls || b.lastTs - a.lastTs);

    let series: Array<Record<string, unknown>> | undefined;
    if (wantSeries && minuteBuckets.size > 0) {
      const sorted = [...minuteBuckets.keys()].sort();
      series = sorted.map((minute) => {
        const mb = minuteBuckets.get(minute)!;
        const row: Record<string, unknown> = { minute };
        for (const name of toolNames) {
          const arr = mb.get(name);
          row[name] = arr && arr.length > 0
            ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
            : 0;
        }
        return row;
      });
    }

    return {
      tools,
      toolNames,
      unavailableTools,
      series,
      windowMinutes,
      windowDays: Math.round(windowMinutes / 1440) || 1,
    };
  });
}
