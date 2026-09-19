/**
 * SQL-only embedding maintenance stats.
 *
 * Regression fix for issue #1929: `/api/v1/embeddings/maintenance` used to
 * paginate every trace/policy/world_model/skill row through JS just to
 * inspect vector byte lengths, hydrating hundreds of MB of BLOBs into the
 * Node heap and blocking the event loop for minutes on production DBs
 * (93K traces × 2 vectors × 1536 dims × 4 bytes ≈ 1.1 GB pread64 traffic).
 *
 * The strategy is a single `SELECT COUNT(*) + SUM(CASE WHEN ...)` per
 * `(table, vec column)` pair, using `LENGTH(vec)` for the dimension
 * comparison. SQLite's `LENGTH()` on a BLOB column returns the byte length
 * from the row header and does not deserialise the buffer, so the maintenance
 * call now stays in the same asymptotic ballpark as `SELECT COUNT(*) FROM t`.
 *
 * The two pre-fix semantic filters are preserved verbatim inside the WHERE
 * clauses so per-bucket counts do not shift for already-installed users:
 *
 *   - `shouldTraceHaveEmbeddings` (short-text traces skipped) → SQL
 *     `LENGTH(TRIM(user_text)) / LENGTH(TRIM(agent_text))` predicates.
 *   - `isLightweightMemoryTrace` (lightweight traces skip vec_action) →
 *     `instr(COALESCE(tags_json, ''), '"lightweight_memory"') = 0`
 *     predicate for the vec_action count only.
 */
import type { StorageDb } from "../types.js";
/** Little-endian Float32 element size. Matches `core/storage/vector.ts`. */
export declare const FLOAT32_BYTES = 4;
export interface EmbeddingCountsBucket {
    /** Number of `(row, vec column)` slots included in the bucket. */
    totalSlots: number;
    /**
     * Vec is non-NULL and either `expectedByteLen === 0` (dimension not
     * probed yet) or `LENGTH(vec) === expectedByteLen`.
     */
    ready: number;
    /** Vec is SQL NULL. */
    missing: number;
    /**
     * Vec is non-NULL and its byte length ≠ `expectedByteLen`
     * (only meaningful when `expectedByteLen > 0`).
     */
    dimMismatch: number;
}
export interface EmbeddingCounts {
    trace: EmbeddingCountsBucket;
    policy: EmbeddingCountsBucket;
    world_model: EmbeddingCountsBucket;
    skill: EmbeddingCountsBucket;
}
/**
 * Count embedding slots per (table, vec column) purely with SQL.
 *
 * MUST NOT read or decode any BLOB into JS. Total wall-clock work is
 * `O(rows)` SQL scan touching only BLOB header bytes.
 *
 * @param db - open storage handle (better-sqlite3 wrapper).
 * @param opts.expectedByteLen - `dimensions * 4` for a known Float32
 *   dimension, or `0` when the dimension has not been probed yet. In the
 *   `0` fallback every non-NULL vector counts as ready and dimMismatch
 *   is always 0 — matches the pre-fix "any non-null = ready" behaviour
 *   that `inferStoredEmbeddingDimension(slots)` used to fall back to.
 */
export declare function embeddingMaintenanceCounts(db: StorageDb, opts: {
    expectedByteLen: number;
}): EmbeddingCounts;
/**
 * Infer the dominant stored embedding byte length by GROUP BY the byte
 * length of every non-NULL `traces.vec_summary` BLOB. Returns the byte
 * length with the highest row count, or 0 when the DB has no vectors
 * (brand-new install).
 *
 * Cheap replacement for the pre-fix
 * `inferStoredEmbeddingDimension(collectEmbeddingSlots())` path — which had
 * to hydrate every BLOB in memory before it could measure any single one.
 * We now let SQLite do the length arithmetic and just pick the mode.
 */
export declare function inferStoredEmbeddingByteLen(db: StorageDb): number;
//# sourceMappingURL=embedding_maintenance.d.ts.map