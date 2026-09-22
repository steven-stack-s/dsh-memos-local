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
export declare const MIN_SAMPLES_FOR_PERCENTILE = 5;
/**
 * Linear-interpolated percentile.
 *
 * `q` accepts either a fraction (`0.95`) or a percentage (`95`) — see
 * `normalizeQuantile`. Returns 0 for an empty sample so it composes with
 * reduce/max without a throw. Input need not be sorted; a copy is sorted
 * internally.
 */
export declare function percentile(values: readonly number[], q: number): number;
/** Convenience wrapper returning the usual trio for a latency sample. */
export declare function latencySummary(durationsMs: readonly number[], calls?: number): {
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    enoughSamples: boolean;
};
//# sourceMappingURL=percentile.d.ts.map