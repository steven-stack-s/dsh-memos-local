/**
 * Stable per-tool colours for the Analytics chart.
 *
 * The chart used to pick a colour by *array index* into the sorted tool
 * list (`TOOL_COLORS[ti % TOOL_COLORS.length]`). Because that list is
 * ordered by call count and re-sorted on every poll, a tool changed colour
 * whenever another overtook it. The screenshot that prompted this had a
 * 5-entry legend (no red at all) sitting above a 6-row table whose
 * `web_search` row was painted red — legend and table had already drifted.
 *
 * Deriving the colour from the tool NAME makes it stable across re-sorts,
 * window changes and reloads, so a reader can follow one tool by colour.
 *
 * Hash collision handling: a plain `hash % palette.length` maps different
 * tools onto the same colour. That is acceptable here (the legend labels
 * every series), but the probe-then-step below keeps the common case — a
 * handful of tools — collision-free when the caller supplies the set.
 */

/** Palette tuned to stay distinguishable on the viewer's light and dark themes. */
export const TOOL_PALETTE = [
  "#7c8cf5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
] as const;

/**
 * FNV-1a over UTF-16 code units. Small, dependency-free, and stable across
 * runs — unlike `Math.random` or anything keyed on insertion order.
 */
function hashName(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    // >>> 0 keeps the multiply in unsigned 32-bit space.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Colour for a tool name. Deterministic: the same name always yields the
 * same colour, independent of what else is on screen.
 *
 * When `allNames` is supplied, collisions are resolved by stepping to the
 * next free palette slot — still deterministic, since the walk order is
 * derived from the sorted name list rather than arrival order.
 */
export function toolColor(name: string, allNames?: readonly string[]): string {
  const key = name ?? "";
  if (!allNames || allNames.length === 0) {
    return TOOL_PALETTE[hashName(key) % TOOL_PALETTE.length]!;
  }

  // Assign in a stable order so the result never depends on the input order.
  const ordered = [...new Set(allNames)].sort();
  const used = new Set<number>();
  for (const candidate of ordered) {
    const start = hashName(candidate) % TOOL_PALETTE.length;
    let slot = start;
    for (let step = 0; step < TOOL_PALETTE.length; step++) {
      const probe = (start + step) % TOOL_PALETTE.length;
      if (!used.has(probe)) {
        slot = probe;
        break;
      }
    }
    used.add(slot);
    if (candidate === key) return TOOL_PALETTE[slot]!;
  }

  return TOOL_PALETTE[hashName(key) % TOOL_PALETTE.length]!;
}
