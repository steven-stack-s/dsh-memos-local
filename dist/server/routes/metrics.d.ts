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
import type { Routes } from "./registry.js";
export declare function registerMetricsRoutes(routes: Routes, deps: ServerDeps): void;
//# sourceMappingURL=metrics.d.ts.map