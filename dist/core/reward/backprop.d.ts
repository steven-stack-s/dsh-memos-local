/**
 * `backprop` — V7 §0.6 eq. 4+5 + §3.3 priority formula.
 *
 * Given traces in chronological order and a terminal reward `rHuman`,
 * compute `V_t` for each step by walking RIGHT-TO-LEFT:
 *
 *   V_T = R_human
 *   V_t = α_t · R_human + (1 − α_t) · γ · V_{t+1}
 *
 * Then compute priority with exponential time decay:
 *
 *   priority(f1_t) = max(V_t, 0) · decay(Δt)
 *   decay(Δt)     = 0.5 ^ (Δt_days / halfLifeDays)
 *
 * Pure function — no I/O. The caller persists via `tracesRepo.updateScore`.
 *
 * Design notes:
 *  - `alpha` is already clamped to [0, 1] by capture, but we clamp again
 *    defensively in case a downstream rescoring widened it.
 *  - `rHuman` is clamped to [-1, 1] to guarantee `V_t` stays in range.
 *  - A trace with no reflection (α=0) gets V_t via pure γ-discount, which
 *    matches V7 §0.6: "pure trial-and-error steps propagate by γ only".
 *  - Priority uses `max(V, 0)` because V7 §3.3 says negative value traces
 *    sink to the bottom but MUST remain on disk — they can still be
 *    surfaced by Decision Repair.
 *  - We do NOT touch `r_human` or `alpha` on the trace row: α stays
 *    capture-owned; r_human is episode-level and lives in `episodes.r_task`.
 */
import type { BackpropInput, BackpropResult } from "./types.js";
export declare function backprop(input: BackpropInput): BackpropResult;
/**
 * Standalone helper: priority for an existing (V, ts) pair. Exposed for
 * `core/memory/l1` retrieval tests and the L3 abstraction pass, both of
 * which need to reweight traces without re-running backprop.
 */
export declare function priorityFor(value: number, ts: number, decayHalfLifeDays: number, now?: number): number;
//# sourceMappingURL=backprop.d.ts.map