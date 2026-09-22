/**
 * Percentile helpers.
 *
 * The Analytics tool-latency panel used to compute p50/p95 inline with
 * `sorted[Math.floor(n * q)]`, which is wrong at both ends of the range:
 *
 *   - n = 2, q = 0.5 → index 1 → the MAXIMUM, so the panel could report a
 *     p50 greater than the mean (an impossible reading that is how the bug
 *     surfaced: samples {681, 1267} displayed as "p50 1267").
 *   - n = 1         → p50 and p95 both collapse onto the single sample, so
 *     one slow call rendered as a full-width "p95" bar.
 *
 * This module uses linear interpolation between closest ranks, matching
 * numpy.percentile's default and Excel's PERCENTILE.INC, and exposes
 * `MIN_SAMPLES_FOR_PERCENTILE` so callers can decline to draw a percentile
 * they have no basis for rather than mislabeling an observation.
 */
/**
 * Below this many samples a percentile is not meaningful — p95 of four
 * calls is just the slowest call. Callers should show the raw range (or
 * hide the column) instead.
 */
export const MIN_SAMPLES_FOR_PERCENTILE = 5;
/**
 * Coerce a quantile to a fraction in [0, 1].
 *
 * Accepts both conventions on purpose: `0.5` and `50` both mean "p50".
 * Everything in the codebase passes a fraction, but the function is named
 * `percentile` and its call sites are labelled p50/p95 — so passing `95`
 * is an easy slip. Silently clamping it to 1 would return the MAXIMUM,
 * which is exactly the class of bug this module was written to remove
 * (a "p50" that is really the largest sample). Treating 1 < q <= 100 as a
 * percentage keeps that mistake harmless; > 100 is clamped to 100.
 */
function normalizeQuantile(q) {
    const value = Number.isFinite(q) ? q : 0;
    if (value > 1 && value <= 100)
        return value / 100;
    return Math.min(1, Math.max(0, value));
}
/**
 * Linear-interpolated percentile.
 *
 * `q` accepts either a fraction (`0.95`) or a percentage (`95`) — see
 * `normalizeQuantile`. Returns 0 for an empty sample so it composes with
 * reduce/max without a throw. Input need not be sorted; a copy is sorted
 * internally.
 */
export function percentile(values, q) {
    const n = values.length;
    if (n === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    if (n === 1)
        return sorted[0];
    const clamped = normalizeQuantile(q);
    // Position in [0, n-1] between closest ranks.
    const pos = clamped * (n - 1);
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    if (lower === upper)
        return sorted[lower];
    const weight = pos - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
/** Convenience wrapper returning the usual trio for a latency sample. */
export function latencySummary(durationsMs, calls = durationsMs.length) {
    const n = durationsMs.length;
    const avgMs = calls > 0
        ? durationsMs.reduce((s, v) => s + v, 0) / n
        : 0;
    return {
        avgMs: Number.isFinite(avgMs) ? avgMs : 0,
        p50Ms: percentile(durationsMs, 0.5),
        p95Ms: percentile(durationsMs, 0.95),
        enoughSamples: calls >= MIN_SAMPLES_FOR_PERCENTILE,
    };
}
//# sourceMappingURL=percentile.js.map