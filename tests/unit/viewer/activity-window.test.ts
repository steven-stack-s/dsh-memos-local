import { afterEach, describe, expect, it, vi } from "vitest";
// Other viewer suites leave a partial window global in the shared fork.
vi.hoisted(() => vi.stubGlobal("window", undefined));
import {
  buildTileData, readActivityWindow, saveActivityWindow, retainActivityEvents,
  loadActivityLogs,
} from "../../../viewer/src/views/overview/activity-window";
import type { CoreEvent, ApiLogDTO } from "../../../viewer/src/api/types";

const now = 10_000_000;
const event = (age: number, seq = age): CoreEvent => ({
  type: "trace.created", ts: now - age, seq, payload: { traceId: String(seq) },
});
const log = (id: number, age: number): ApiLogDTO => ({
  id, calledAt: now - age, toolName: "memory_add", inputJson: "{}",
  outputJson: "{}", success: true, durationMs: 1,
});
afterEach(() => vi.unstubAllGlobals());

describe("activity window", () => {
  it.each([[5, 1], [15, 2], [30, 3], [60, 4]] as const)(
    "%i minutes filters counts and latest events with 30 buckets", (minutes, count) => {
      const data = buildTileData([event(2_700_000), event(1_200_000), event(600_000), event(60_000)], "memory", now, minutes);
      expect(data.count).toBe(count);
      expect(data.buckets).toHaveLength(30);
      expect(data.buckets.reduce((a, b) => a + b, 0)).toBe(count);
      expect(data.last?.evt.ts).toBe(now - 60_000);
    },
  );
  it("excludes the lower boundary, future events and other categories", () => {
    const data = buildTileData([event(300_000), event(299_999), event(-1), {
      ...event(1), type: "system.started",
    }], "memory", now, 5);
    expect(data.count).toBe(1);
    expect(data.buckets[0]).toBe(1);
    expect(buildTileData([event(300_000)], "memory", now, 5).last).toBeNull();
  });
  it("retains over 512 unique events for the hour and removes expired events", () => {
    const events = Array.from({ length: 800 }, (_, i) => event(i + 1));
    const result = retainActivityEvents([...events, events[0], event(3_600_000)], now);
    expect(result).toHaveLength(800);
    expect(result[0].ts).toBe(now - 1);
  });
  it("restores a saved option and falls back safely for invalid or blocked storage", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    expect(readActivityWindow()).toBe(5);
    saveActivityWindow(30);
    expect(readActivityWindow()).toBe(30);
    values.set("memos.activityWindow", "12");
    expect(readActivityWindow()).toBe(5);
    vi.stubGlobal("localStorage", { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } });
    expect(readActivityWindow()).toBe(5);
    expect(() => saveActivityWindow(60)).not.toThrow();
  });
  it("loads beyond the first log page and stops at the time boundary", async () => {
    const result = await loadActivityLogs(async (offset) => {
      if (offset === 0) return { logs: [log(3, 100)], nextOffset: 1 };
      if (offset === 1) return { logs: [log(2, 600_000), log(1, 3_600_000)], nextOffset: 3 };
      throw Error("must stop at the boundary");
    }, now);
    expect(result.logs.map((row) => row.id)).toEqual([3, 2]);
    expect(result.truncated).toBe(false);
  });
  it("deduplicates logs repeated across shifting pages", async () => {
    const result = await loadActivityLogs(async (offset) => offset === 0
      ? { logs: [log(2, 100)], nextOffset: 1 }
      : { logs: [log(2, 100), log(1, 200)] }, now);
    expect(result.logs.map((row) => row.id)).toEqual([2, 1]);
  });
  it("reports partial history when pagination cannot advance", async () => {
    const result = await loadActivityLogs(async () => ({ logs: [log(1, 1)], nextOffset: 0 }), now);
    expect(result.truncated).toBe(true);
  });
  it("bounds a dense history scan and reports truncation", async () => {
    let pages = 0;
    const result = await loadActivityLogs(async (offset) => {
      pages++;
      if (pages > 20) throw Error("unbounded scan");
      return { logs: [log(offset + 1, 1)], nextOffset: offset + 1 };
    }, now);
    expect(result.truncated).toBe(true);
    expect(result.logs).toHaveLength(20);
  });
  it("propagates request failure so the view can show stale history", async () => {
    await expect(loadActivityLogs(async () => { throw Error("offline"); }, now)).rejects.toThrow("offline");
  });
});
