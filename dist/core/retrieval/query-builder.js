/**
 * Convert a `RetrievalCtx` into a single embedding-friendly query string +
 * a set of coarse domain tags to pre-filter Tier-2 with.
 *
 * Keeping this logic in one place means the 5 entry points in `retrieve.ts`
 * don't each reinvent "what do we embed?" — they all call `buildQuery(ctx)`.
 *
 * Not perf-sensitive: inputs are short (≤ a few KB) and we do plain regex
 * scans, no LLM calls.
 */
import { extractErrorSignatures } from "../capture/error-signature.js";
import { extractExactIdentifiers, extractPatternTerms, prepareFtsMatch, } from "../storage/keyword.js";
const MAX_QUERY_CHARS = 1_500;
/** Public tag list kept in sync with `capture/tagger.ts#KEYWORD_TAGS`. */
const KEYWORD_TAGS = [
    { re: /\bdocker\b|\bcontainer\b/i, tag: "docker" },
    { re: /\bkubernetes\b|\bkubectl\b|\bk8s\b/i, tag: "kubernetes" },
    { re: /\bpip\b|\brequirements\.txt\b/i, tag: "pip" },
    { re: /\bnpm\b|\byarn\b|\bpnpm\b|\bpackage\.json\b/i, tag: "npm" },
    { re: /\bsqlite\b|\bpostgres\b|\bmysql\b|\bdatabase\b/i, tag: "database" },
    { re: /\bsql\b|\bselect\s|\binsert\s/i, tag: "sql" },
    { re: /\bshell\b|\bbash\b|\bzsh\b|\bterminal\b/i, tag: "shell" },
    { re: /\bgit\b|\bcommit\b|\bmerge\b|\bbranch\b/i, tag: "git" },
    { re: /\bpython\b|\.py\b/i, tag: "python" },
    { re: /\btypescript\b|\.ts\b|\.tsx\b/i, tag: "typescript" },
    { re: /\bjavascript\b|\.js\b|\.jsx\b/i, tag: "javascript" },
    { re: /\brust\b|\bcargo\b|\.rs\b/i, tag: "rust" },
    { re: /\bplugin\b/i, tag: "plugin" },
    { re: /\bapi\b|\brest\b|\bhttp\b/i, tag: "http" },
    { re: /network|\bdns\b|\bproxy\b/i, tag: "network" },
    { re: /\bauth(entication|orization)?\b|\btoken\b|\boauth\b/i, tag: "auth" },
    { re: /\btest\b|\bunit test\b|\bjest\b|\bvitest\b|\bpytest\b/i, tag: "test" },
    { re: /\berror\b|\bexception\b|\btraceback\b/i, tag: "error" },
];
/**
 * Build a `CompiledQuery` from a retrieval context. Behavior varies per
 * reason so that e.g. `decision_repair` biases toward the failing tool name.
 */
export function buildQuery(ctx, opts = {}) {
    switch (ctx.reason) {
        case "turn_start": {
            // contextHints carry host routing / transport metadata (workspace,
            // channel, message id, sender id, etc.). They are useful to the
            // runtime, but pollute both embeddings and lexical channels when
            // mixed into the user's semantic query.
            return finalize(ctx.userText?.trim() ?? "", opts);
        }
        case "tool_driven": {
            if (typeof ctx.args?.query === "string" && ctx.args.query.trim()) {
                const rest = { ...ctx.args };
                delete rest.query;
                const restText = Object.keys(rest).length > 0 ? renderArgs(rest) : "";
                return finalize([ctx.args.query.trim(), restText].filter(Boolean).join("\n"), opts);
            }
            const args = renderArgs(ctx.args);
            return finalize(`tool:${ctx.tool}\n${args}`, opts);
        }
        case "skill_invoke": {
            const head = ctx.skillId ? `skill:${ctx.skillId}\n` : "";
            return finalize(head + (ctx.query ?? ""), opts);
        }
        case "sub_agent": {
            const profile = ctx.profile ? `profile:${ctx.profile}\n` : "";
            return finalize(profile + (ctx.mission ?? ""), opts);
        }
        case "decision_repair": {
            const head = `failing_tool:${ctx.failingTool}\nfailures:${ctx.failureCount}\n`;
            const tail = ctx.lastErrorCode ? `error:${ctx.lastErrorCode}` : "";
            return finalize(head + tail, opts);
        }
        default: {
            // Exhaustiveness — compile-time check.
            const _exhaustive = ctx;
            void _exhaustive;
            return {
                text: "",
                tags: [],
                structuralFragments: [],
                ftsMatch: null,
                patternTerms: [],
                exactIdentifiers: [],
                truncated: false,
            };
        }
    }
}
/** Extract the coarse domain tags *without* embedding — cheaper for logs. */
export function extractTags(text) {
    const tags = new Set();
    for (const { re, tag } of KEYWORD_TAGS) {
        if (re.test(text))
            tags.add(tag);
    }
    return [...tags].sort();
}
// ─── Helpers ────────────────────────────────────────────────────────────────
function finalize(raw, opts) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) {
        return {
            text: "",
            tags: [],
            structuralFragments: [],
            ftsMatch: null,
            patternTerms: [],
            exactIdentifiers: [],
            truncated: false,
        };
    }
    const tags = extractTags(trimmed);
    // Reuse the capture-side extractor so signature shapes stay identical
    // between write-side and read-side.
    const structuralFragments = extractErrorSignatures({
        toolCalls: [],
        agentText: trimmed,
    });
    // Keyword channels — derived from the original text *before* truncation
    // so we don't lose tail content. The actual queries are bounded by the
    // helpers themselves.
    const ftsMatch = prepareFtsMatch(trimmed, { tokenizer: opts.ftsTokenizer });
    const patternTerms = extractPatternTerms(trimmed);
    const exactIdentifiers = extractExactIdentifiers(trimmed);
    if (trimmed.length <= MAX_QUERY_CHARS) {
        return {
            text: trimmed,
            tags,
            structuralFragments,
            ftsMatch,
            patternTerms,
            exactIdentifiers,
            truncated: false,
        };
    }
    const halfMinus = Math.floor((MAX_QUERY_CHARS - 32) / 2);
    const head = trimmed.slice(0, halfMinus);
    const tail = trimmed.slice(trimmed.length - halfMinus);
    return {
        text: `${head}\n...[truncated]...\n${tail}`,
        tags,
        structuralFragments,
        ftsMatch,
        patternTerms,
        exactIdentifiers,
        truncated: true,
    };
}
function renderArgs(args) {
    if (!args)
        return "";
    try {
        return JSON.stringify(args, null, 0);
    }
    catch {
        return String(args);
    }
}
//# sourceMappingURL=query-builder.js.map