# Changelog

Notable changes to `dsh-memos-local`. Maintained by hand; for the full
per-commit history use `git log` or the GitHub releases page.

## [v2.0.19]

Version alignment with upstream `@memtensor/memos-local-plugin` **2.0.19**
(released 2026-09-08). A file-by-file comparison against the published
2.0.19 tarball showed the core algorithm tree already matched; only the
distribution-layer patches below differ, so this release is a version bump
plus doc refresh rather than a code import.

### Synced from upstream

- Core/`agent-contract`/`server` sources match upstream 2.0.19 byte-for-byte
  except for the intentional DSH patches listed below.
- `version` bumped `2.0.16-beta.1` → `2.0.19`.

### DSH-fork deltas kept (and why they survive a sync)

- `core/embedding/providers/local.ts` — routes model downloads through
  `hf-mirror.com` and persists the cache under `$DSH_HOME`, so first-run
  embedding works behind the GFW.
- `core/logger/index.ts` — default `tz` is `Asia/Shanghai` (overridable via
  `MEMOS_TZ`/`TZ`) so log timestamps match the deployment timezone.
- `server/routes/auth.ts` — optional password gate with the
  `.auth-disabled` marker and the `auth/enable|disable` endpoints.
- `adapters/deepseek-harness/` — the Cordis bundle, viewer proxy and
  `cordis.patch.yml` (bare package name for DSH's client scanner).

### Note

`core/update-check` compares against the npm `latest` dist-tag. With this
bump the running plugin no longer reports a phantom "newer version".

## [v2.0.16-beta.1]

Initial DSH-oriented release of the `dsh-memos-local` fork (subtree-split
from MemTensor/MemOS `apps/memos-local-plugin`).

### Memory system

- Out-of-tree DeepSeek Harness Cordis bundle with capture and four-layer
  memory (L1 trace / L2 policy / L3 world model / Skill), a feedback-driven
  self-evolution loop, and one automatic recall for every accepted, non-empty
  direct-user turn.
- Six memory tools; DSH-profile-aware storage (`$DSH_HOME/memos-plugin/`).
- Same-turn re-entry de-duplicated; greetings and restored-session turns get
  the same recall as any other direct query.
- Automatic recall and explicit `memos_search` share one absolute deadline
  (`min(recallTimeoutMs, 3000)` ms; 3000 ms default).
- Relation/intent/episode routing plus capture (summary + embedding writes)
  runs in a per-session serial background queue; the next turn never joins it.
- Fail-open lifecycle handling with bounded recovery; clean Cordis disposal.

### DSH integration (this fork)

- **Memory tab in the DSH sidebar** — `client/client.js` registers a
  `main` panel (key `memos`) that embeds the viewer at the same-origin
  `/memos/`, plus a `sidebar.panellist` entry and a `settings.section`.
- **Viewer reverse proxy on DSH's web server** — the adapter mounts the
  loopback-only viewer (`127.0.0.1:18801`) at the `/memos` prefix via
  `webServer`, so the same external HTTPS entrance reaches it with no
  Mixed-Content and no extra port mapping. Injects `<base href="/memos/">`
  and a fetch/XHR/EventSource shim.
- Package metadata: `exports["."]` points at the DeepSeek-harness adapter;
  `cordis.patch.yml` uses the bare package name so the client bundle is
  picked up by DSH's client-modules scanner.
- Existing MemOS HTTP/SSE Viewer on configurable port `18801` with enforced
  localhost/IPv4 loopback binding.

### Runtime & tooling

- Transformers.js 4.2 / ONNX Runtime 1.24.3 for crash-free macOS process exit.
- One-command temporary bootstrap of DSH's pinned `pnpm@11.7.0` when pnpm is
  absent, without modifying the user's global package manager.
- zh-CN / en bilingual README (`README.zh-CN.md` + `README.md` interlinks).

## [v2.0.6]

Documentation fix: clarify install path and stale directory names (#1540).

## [v2.0.0-beta.1]

Complete end-to-end implementation: L1/L2/L3/Skill layers, three-tier
retrieval, decision repair, crystallization, dual adapters, HTTP/SSE server,
Vite viewer.

## [v2.0.0-alpha.1]

Project skeleton, agent-contract layer, install.sh entrypoint, viewer
directory layout.
