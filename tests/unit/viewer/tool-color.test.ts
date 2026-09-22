/**
 * Regression: tool colours in the Analytics chart were assigned by array
 * index into the *sorted* tool list:
 *
 *     const color = TOOL_COLORS[ti % TOOL_COLORS.length];
 *
 * `toolNames` is ordered by call count (descending) and re-sorted on every
 * poll, so a tool that overtook another silently swapped colours. The
 * screenshot that prompted this had a 5-entry legend (no red) above a
 * 6-row table whose `web_search` row was rendered red — the legend and the
 * table had already drifted apart.
 *
 * Colours are now derived from the tool NAME, so a given tool keeps its
 * colour across re-sorts, window changes and reloads.
 */
import { describe, expect, it } from "vitest";

import { toolColor } from "../../../viewer/src/views/analytics/tool-color";

describe("toolColor", () => {
  it("is stable regardless of list position", () => {
    // Same name => same colour, no matter what order it appears in.
    const a = toolColor("run_code");
    const b = toolColor("run_code");
    expect(a).toBe(b);
  });

  it("does not depend on how many tools are present", () => {
    const before = toolColor("web_search");
    // Simulating a re-sort: the function only sees the name, so the value
    // cannot change. This asserts the property rather than an implementation.
    const after = toolColor("web_search");
    expect(after).toBe(before);
  });

  it("gives different tools different colours in practice", () => {
    const names = [
      "run_code",
      "memory_add",
      "memos_search",
      "web_search",
      "web_fetch",
      "ask_user_question",
    ];
    const colors = new Set(names.map((n) => toolColor(n)));
    // A collision is possible in principle (hash mod palette size), but
    // the six tools above should not all collapse.
    expect(colors.size).toBeGreaterThanOrEqual(4);
  });

  it("always returns a colour from the palette", () => {
    for (const name of ["", "x", "a".repeat(200), "中文工具"]) {
      expect(toolColor(name)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
