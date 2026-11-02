/**
 * Producer attribution for memos-emitted messages.
 *
 * DSH 0.1.7 (Session V4) rejected every turn with
 * `format v4 message requires a producer-owned source kind` because the
 * plugin emitted the retired catch-all shell `{ kind: "plugin", plugin: ... }`.
 *
 * `MessageSourceMap` in `@deepseek-ai/dsh-llm` is merge-extensible and states
 * that there is no shared catch-all `plugin` kind: each producer declares its
 * own kind, so an unregistered producer resolves to `"plugin:<name>"` and the
 * separate `plugin` field is dropped. The released V3→V4 converter in
 * `@deepseek-ai/dsh-session-format-v3-to-v4` confirms the direction: it
 * rewrites `{ kind: "plugin", plugin: "<name>" }` into
 * `{ kind: "plugin:<name>" }` and deletes the `plugin` key, and native V4
 * admission refuses retired plugin wrappers outright.
 *
 * Emitting `kind` alone therefore satisfies both formats: a V3 session keeps
 * this as a direct (already producer-owned) kind, and a V4 session accepts it
 * natively. Re-adding `plugin` would only restore the shape V4 rejects.
 */
export interface MemOSMessageSource {
  kind: "plugin:memos-local-memory";
  form?: "recall";
}

declare module "@deepseek-ai/dsh-llm" {
  interface MessageSourceMap {
    "plugin:memos-local-memory": MemOSMessageSource;
  }
}

export function memosMessageSource(form?: "recall"): MemOSMessageSource {
  return {
    kind: "plugin:memos-local-memory",
    ...(form ? { form } : {}),
  };
}
