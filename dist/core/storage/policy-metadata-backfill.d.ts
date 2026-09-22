import type { StorageDb } from "./types.js";
/**
 * Fill metadata for legacy policies without holding the migration transaction
 * open. The query is deliberately bounded: a large 2.0.x database is healed
 * over several normal boots instead of making the first upgrade block on a
 * full-table rewrite. Rows are selected by `metadata_json IS NULL`, making the
 * operation idempotent and safe to resume after an interrupted boot.
 */
export declare function backfillLegacyPolicyMetadata(db: StorageDb, options?: {
    batchSize?: number;
}): number;
//# sourceMappingURL=policy-metadata-backfill.d.ts.map