/**
 * Regression: the Analytics tool panel mis-reported p50/p95.
 *
 * The old inline code did:
 *
 *     const p50 = durs[Math.floor(n * 0.5)];
 *     const p95 = durs[Math.min(n - 1, Math.floor(n * 0.95))];
 *
 * which is wrong at both ends of the range:
 *
 *   - n = 2  → `p50` indexes element 1, i.e. the MAXIMUM. The panel showed
 *              "p50 1267" for a pair of samples {681, 1267} whose median is
 *              plainly 974 — a p50 above the mean is impossible, which is
 *              how the bug was spotted.
 *   - n = 1  → p50 and p95 both collapse onto the single sample, so one
 *              slow call renders as a full-width "p95" bar.
 *
 * Percentiles are now computed with linear interpolation between closest
 * ranks, and the sample count is reported alongside so the UI can refuse
 * to draw a percentile it has no basis for.
 */
import { describe, expect, it } from "vitest";

import { percentile, MIN_SAMPLES_FOR_PERCENTILE } from "../../../core/util/percentile.js";

describe("percentile", () => {
  it("interpolates between closest ranks", () => {
    // Matches numpy.percentile / Excel PERCENTILE.INC behaviour.
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 10);
    expect(percentile([1, 2, 3, 4], 95)).toBeCloseTo(3.85, 10);
  });

  it("returns the true median for two samples, not the maximum", () => {
    // The exact shape that produced the impossible "p50 > avg" reading.
    expect(percentile([681, 1267], 50)).toBeCloseTo(974, 10);
  });

  it("handles a single sample by returning it for every quantile", () => {
    expect(percentile([33737], 50)).toBe(33737);
    expect(percentile([33737], 95)).toBe(33737);
  });

  it("does not require sorted input", () => {
    expect(percentile([30, 10, 20], 50)).toBeCloseTo(20, 10);
  });

  it("accepts an empty list without throwing", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("accepts a percentage as well as a fraction", () => {
    // The function is *named* percentile and its call sites read p50/p95,
    // so passing 95 instead of 0.95 is an easy slip. Silently clamping it
    // to 1 would return the maximum — the very bug this module exists to
    // remove — so a value in (1, 100] is read as a percentage.
    expect(percentile([1, 2, 3, 4], 50)).toBeCloseTo(2.5, 10);
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(percentile([1, 2, 3, 4], 95)).toBeCloseTo(3.85, 10);
  });

  it("clamps genuinely out-of-range quantiles", () => {
    expect(percentile([1, 2, 3], -1)).toBe(1);
    // Above 100% is meaningless; clamp to the maximum rather than wrap.
    expect(percentile([1, 2, 3], 250)).toBe(3);
  });

  it("exposes a minimum sample threshold the UI can gate on", () => {
    // Below this, a "p95" is just the largest observation wearing a
    // statistical label.
    expect(MIN_SAMPLES_FOR_PERCENTILE).toBeGreaterThanOrEqual(5);
  });
});
