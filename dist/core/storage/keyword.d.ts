/**
 * `keyword.ts` — shared helpers for the FTS5 + pattern keyword channels.
 *
 * Two utilities live here:
 *
 *   1. `prepareFtsMatch(query)` — sanitise a free-form user query for an
 *      FTS5 MATCH clause. We split on whitespace, apply the configured
 *      keyword token mode, escape internal quotes and AND the resulting
 *      phrases.
 *
 *   2. `extractPatternTerms(query)` — return short tokens (length 2)
 *      and CJK bigrams (sliding 2-char windows over CJK runs). These
 *      cover the queries that fall below the trigram tokenizer's 3-char
 *      window — most importantly 2-char Chinese names and verbs which
 *      are extremely common in zh-CN agent traffic.
 *
 * Both helpers are pure — no SQL prepared here so the repos can choose
 * the right column list / table for the FTS join.
 */
export type FtsTokenizerMode = "trigram" | "cjk";
export interface PrepareFtsMatchOptions {
    tokenizer?: FtsTokenizerMode;
}
/**
 * Extract bounded high-entropy identifiers that require exact lexical
 * confirmation. The concrete values are carried through retrieval but never
 * added to structured logs.
 */
export declare function extractExactIdentifiers(query: string): string[];
/** Normalisation shared by query extraction and hydrated candidate checks. */
export declare function normalizeIdentifierText(text: string): string;
/**
 * Sanitised FTS5 MATCH expression.
 *
 * Returns `null` when no usable token is left (caller should skip the
 * FTS channel rather than issue an empty MATCH).
 */
export declare function prepareFtsMatch(query: string, opts?: PrepareFtsMatchOptions): string | null;
/**
 * Pattern-channel terms — what the trigram FTS can't catch on its own.
 *
 * Returns:
 *   - 2-char ASCII tokens from the query (FTS trigram requires ≥3).
 *   - CJK bigrams sliding over each CJK run of length ≥2.
 *
 * Empty array is a perfectly valid result — caller skips the pattern
 * channel.
 */
export declare function extractPatternTerms(query: string): string[];
/**
 * Reciprocal-rank scoring helper used by FTS / pattern hits.
 *
 * FTS5 returns rows in `rank` order (lower = better) and we want to
 * fuse with vector cosine via the ranker's RRF pass; using
 * `1 / (k + rank + 1)` here keeps the contribution shape identical to
 * the cosine-derived RRF and avoids needing to invent a synthetic
 * cosine for keyword hits.
 */
export declare function reciprocalRankScore(rank0: number, k?: number): number;
//# sourceMappingURL=keyword.d.ts.map