import type { ApiLogDTO, CoreEvent } from "../../api/types";
import { decorateEvent, type DecoratedEvent, type EventCategory } from "./event-meta";

export type ActivityWindow = 5 | 15 | 30 | 60;
export const ACTIVITY_WINDOWS: readonly ActivityWindow[] = [5, 15, 30, 60];
const HOUR_MS = 3_600_000;
const STORAGE_KEY = "memos.activityWindow";
export interface TileData {
  buckets: number[];
  count: number;
  last: DecoratedEvent | null;
}

export function buildTileData(
  events: readonly CoreEvent[], cat: EventCategory, now: number, minutes: ActivityWindow,
): TileData {
  const bucketMs = minutes * 60_000 / 30;
  const buckets: number[] = new Array(30).fill(0);
  let count = 0;
  let last: DecoratedEvent | null = null;
  for (const evt of events) {
    if (!Number.isFinite(evt.ts)) continue;
    const idx = 29 - Math.floor((now - evt.ts) / bucketMs);
    if (idx < 0 || idx >= 30) continue;
    const decorated = decorateEvent(evt);
    if (decorated.cat !== cat) continue;
    buckets[idx]++;
    count++;
    if (!last || evt.ts > last.evt.ts) last = decorated;
  }
  return { buckets, count, last };
}

export function readActivityWindow(): ActivityWindow {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (ACTIVITY_WINDOWS.includes(saved as ActivityWindow)) return saved as ActivityWindow;
  } catch { /* Storage can be blocked in embedded viewers. */ }
  return 5;
}

export function saveActivityWindow(minutes: ActivityWindow): void {
  try { localStorage.setItem(STORAGE_KEY, String(minutes)); }
  catch { /* Keep the in-memory selection when storage is unavailable. */ }
}

export function retainActivityEvents(events: readonly CoreEvent[], now: number): CoreEvent[] {
  const byKey = new Map<string, CoreEvent>();
  for (const evt of events) {
    if (!Number.isFinite(evt.ts) || evt.ts <= now - HOUR_MS || evt.ts > now) continue;
    const id = evt.correlationId ?? evt.seq;
    byKey.set(`${evt.type}:${id}:${evt.ts}`, evt);
  }
  return [...byKey.values()].sort((a, b) => b.ts - a.ts);
}

export interface ActivityLogPage { logs: ApiLogDTO[]; nextOffset?: number }

// The existing API is newest-first. Stop at one hour; cap requests so a
// busy installation cannot trigger an unbounded scan on every refresh.
export async function loadActivityLogs(
  readPage: (offset: number) => Promise<ActivityLogPage>, now: number,
): Promise<{ logs: ApiLogDTO[]; truncated: boolean }> {
  const logs = new Map<number, ApiLogDTO>();
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const res = await readPage(offset);
    let reachedBoundary = false;
    for (const log of res.logs) {
      if (log.calledAt <= now - HOUR_MS) reachedBoundary = true;
      else if (log.calledAt <= now) logs.set(log.id, log);
    }
    if (reachedBoundary || res.nextOffset == null) {
      return { logs: [...logs.values()], truncated: false };
    }
    if (!res.logs.length || !Number.isFinite(res.nextOffset) || res.nextOffset <= offset) break;
    offset = res.nextOffset;
  }
  return { logs: [...logs.values()], truncated: true };
}
