/**
 * Regression: the Analytics "tool latency" panel silently under-reported.
 *
 * `GET /api/v1/metrics/tools` asked `listApiLogs({ limit: 5000 })`, but the
 * core clamps that to 500 rows, so the aggregation only ever saw the most
 * recent 1 hour of `api_logs` no matter which time window the user picked.
 * On a database with 12k rows the 24h view showed 12 calls where the truth
 * was 61, and the 30d view showed 12 where the truth was 574.
 *
 * The fix is to aggregate in SQL over a time range instead of pulling a
 * page of rows into memory, so the result no longer depends on any page
 * limit.
 */
import { describe, expect, it } from "vitest";

import { makeTmpDb } from "../../helpers/tmp-db.js";

function seedLogs(
  repos: ReturnType<typeof makeTmpDb>["repos"],
  count: number,
  baseTs: number,
): void {
  for (let i = 0; i < count; i++) {
    repos.apiLogs.insert({
      toolName: "memory_add",
      input: {},
      output: {},
      durationMs: 10 + i,
      // Every 10th row is a failure, so the error count is easy to assert.
      success: i % 10 !== 0,
      calledAt: baseTs + i,
    });
  }
}

describe("apiLogs.aggregateByTool", () => {
  it("counts every row in range, not just the first page", () => {
    const { repos, cleanup } = makeTmpDb();
    try {
      // 1200 rows is well past the 500-row page cap that caused the bug.
      seedLogs(repos, 1200, 1_700_000_000_000);

      const stats = repos.apiLogs.aggregateByTool({
        since: 1_700_000_000_000,
      });

      expect(stats).toHaveLength(1);
      expect(stats[0]!.toolName).toBe("memory_add");
      // The whole point: all 1200, not 500.
      expect(stats[0]!.calls).toBe(1200);
      // i % 10 === 0 fails → 0,10,...,1190 = 120 failures.
      expect(stats[0]!.errors).toBe(120);
    } finally {
      cleanup();
    }
  });

  it("excludes rows older than the window", () => {
    const { repos, cleanup } = makeTmpDb();
    try {
      seedLogs(repos, 100, 1_700_000_000_000); // old
      seedLogs(repos, 40, 1_800_000_000_000); // recent

      const stats = repos.apiLogs.aggregateByTool({ since: 1_750_000_000_000 });

      expect(stats).toHaveLength(1);
      expect(stats[0]!.calls).toBe(40);
    } finally {
      cleanup();
    }
  });

  it("returns per-tool rows so callers can attribute latency", () => {
    const { repos, cleanup } = makeTmpDb();
    try {
      seedLogs(repos, 10, 1_700_000_000_000);
      for (let i = 0; i < 5; i++) {
        repos.apiLogs.insert({
          toolName: "memos_search",
          input: {},
          output: {},
          durationMs: 100,
          success: true,
          calledAt: 1_700_000_000_000 + i,
        });
      }

      const stats = repos.apiLogs.aggregateByTool({ since: 1_600_000_000_000 });
      const byName = new Map(stats.map((s) => [s.toolName, s]));

      expect(byName.get("memory_add")!.calls).toBe(10);
      expect(byName.get("memos_search")!.calls).toBe(5);
      // durationMs 100 for every memos_search row.
      expect(byName.get("memos_search")!.avgMs).toBe(100);
    } finally {
      cleanup();
    }
  });

  it("reports the newest timestamp per tool", () => {
    const { repos, cleanup } = makeTmpDb();
    try {
      seedLogs(repos, 10, 1_700_000_000_000);
      const stats = repos.apiLogs.aggregateByTool({ since: 1_600_000_000_000 });
      // Last seeded row is base + 9.
      expect(stats[0]!.lastTs).toBe(1_700_000_000_009);
    } finally {
      cleanup();
    }
  });
});
