# Changelog

Notable changes to `dsh-memos-local`. Maintained by hand; for the full
per-commit history use `git log` or the GitHub releases page.

## [v2.0.19-dsh.2]

### Fixed — Viewer panels showed no data while the Overview counts did

The Skills, Experiences, and Environment-knowledge panels could render an
**empty list** while the Overview cards for the same layers showed a
**non-zero count**. Talking one more round to the agent made the panels
recover, which made it look like a caching problem; it was not.

**Root cause.** The Overview endpoint pins `includeAllNamespaces: true` on
every count, but the three panels behind it did not. The core keeps a
*turn-scoped* active namespace: the DSH adapter boots it from the configured
`profileId`, while rows are actually owned by the session's `agentPreset`.
When those differ — e.g. the shipped `cordis.patch.yml` sets
`profileId: default` while every session carries `agentPreset: standard` —
namespace-scoped reads return nothing until the first turn flips the active
namespace. Hence: counts visible, lists empty, self-healing after one turn.
The same mismatch made the policy drawer report "0 linked skills / 0 linked
world models" for rows whose links existed.

**Fix.** Align the three panel routes with the convention already used by
`overview.ts`, `trace.ts`, and `session.ts` (#2131): pass
`includeAllNamespaces: true` and let an explicit
`ownerAgentKind` / `ownerProfileId` query narrow the result.

- `GET /api/v1/skills` — `listSkills` / `countSkills`.
- `GET /api/v1/policies` — `listPolicies` / `countPolicies`.
- `GET /api/v1/world-models` — `listWorldModels` / `countWorldModels`.
- `GET /api/v1/policies/:id/usage` — the cross-reference lists.

The core's namespace isolation is **unchanged**; it is intended behaviour.
Only the viewer's read convention changed, so the cards and the panels can no
longer disagree. The namespace dropdown still narrows as before.

**Regression tests.** `tests/unit/server/http.test.ts` pins the
all-namespace convention for all six calls plus the "explicit filter still
narrows" case; `tests/unit/pipeline/repro-namespace-flip.test.ts` reproduces
the boot-time namespace mismatch and asserts the panels still resolve.

Verified end-to-end against a snapshot of a real database booted with the
mismatching `profileId`: before the fix the Overview read 35/99/3 with all
three panels empty; after it, the panels return those same rows.

> Note: the shipped `cordis.patch.yml` still sets `profileId: default`, which
> does not match the `agentPreset` values in use (`standard`, `ptc`). It is no
> longer harmful for the viewer, but the config itself is still misleading and
> should be corrected separately.

## [v2.0.19-dsh.1]

### Versioning — the fork now carries its own revision series

**Breaking change to the version policy.** Until now the version tracked
upstream `@memtensor/memos-local-plugin` exactly; it is now
`<upstream-version>-dsh.<local-revision>` (e.g. `2.0.19-dsh.1`), and the git tag
is `v` plus that version (`v2.0.19-dsh.1`).

Rationale: **npm version numbers are permanent.** When a version is
unpublished, the registry deletes the artifacts but keeps a tombstone in the
packument's `time` table, and rejects any later publish of that number with
`400 Cannot publish over previously published version`. On 2026-09-19 both
`2.0.19` and `2.0.20` were unpublished from npmjs, which permanently burned
those numbers — a fork that mirrors upstream numbers runs out of publishable
versions. See README "Version policy" for the full rules.

**`-dsh.N` is prerelease syntax, and that is deliberate.** The first
implementation used build metadata (`2.0.19+dsh.1`) precisely because it is
ignored in precedence comparisons and therefore still satisfies `^2.0.19`. That
implementation was exercised against the real registry and **failed**: npm
strips the `+` segment on the publish path, so `npm publish` built
`...-2.0.19.tgz`, PUT version `2.0.19`, and hit the tombstone:

```
npm notice version: 2.0.19
npm notice filename: steven-stack-s-dsh-memos-local-2.0.19.tgz
npm error 400 Bad Request - PUT https://registry.npmjs.org/@steven-stack-s%2fdsh-memos-local
npm error - Cannot publish over previously published version "2.0.19".
```

Build metadata cannot distinguish fork releases from the upstream number, so
prerelease syntax is used instead. It survives the publish path intact.

**Caveat:** a prerelease sorts below its release, so `2.0.19-dsh.1` does *not*
satisfy `^2.0.19`. Install by exact version, by dist-tag (`latest`), or via
`dsh plugin add` — not through a caret range. Documented in the README.

### Publishing safety

- **`publish-npmjs.yml` no longer publishes blindly.** A tag push now runs
  `npm publish --dry-run` only; a real publish requires a manual
  `workflow_dispatch` run with `dry_run: false`.
- **`publish-github-packages.yml` gets the same guard.** Both workflows trigger
  on `v*` tags, so hardening only the npmjs one left the mirror publishing
  automatically on every tag push. It now defaults to `--dry-run` too.
- **Pre-flight version check.** Before publishing, the workflow queries the
  registry and fails fast if the version is already used — including versions
  that were unpublished but remain tombstoned in `time`. The previous failure
  mode (`400` after a full build) is now caught before the build. It uses Node
  `fetch` rather than `curl` and fails closed: an initial `curl ... || echo '{}'`
  version silently passed every version when `curl` was absent, which is worse
  than no guard at all.
- Both workflows verify the tag equals `v` + `package.json.version`.

## [v2.0.19]

### Distribution

- **Primary registry is now npmjs.org (public npm).** `@steven-stack-s/dsh-memos-local`
  is published there via `publish-npmjs.yml`, so anyone can install it
  anonymously — no token, no `.npmrc`, no GitHub account:
  `dsh plugin --profile web add @steven-stack-s/dsh-memos-local`.
- GitHub Packages remains as a mirror (`publish-github-packages.yml`), but
  note its npm registry requires authentication **even for public packages**
  (GitHub documents this: only the container registry allows anonymous pulls).
- `publishConfig` now points at npmjs with `access: public`; the GitHub
  Packages workflow overrides the registry explicitly.

### Distribution (GitHub Packages)

- **Published to GitHub Packages** as the scoped package
  `@steven-stack-s/dsh-memos-local`, via `publish-github-packages.yml`
  (tag push → `npm publish`, using the built-in `GITHUB_TOKEN`;
  no PAT required). GitHub Packages only accepts scoped names, hence the
  rename from `dsh-memos-local`.
- **Build output is committed** (`dist/`, `viewer/dist/`) so a plain git
  install is runnable without a build step — the `dsh plugin` install path
  does not run `prepare`, and `postinstall` only prints a notice. Source
  maps stay excluded.
- Install docs added for both routes (GitHub Packages registry and the
  codeload tarball URL, which is the one that works behind the proxy here).

### Version policy

- **The version tracks upstream `@memtensor/memos-local-plugin` exactly.**
  `package.json.version` must equal the tag without its `v` prefix; the
  publish workflow fails the build otherwise.

### Compatibility

- The DSH-facing plugin identity is unchanged in spirit: the cordis loader
  entry now resolves the scoped package name
  (`@steven-stack-s/dsh-memos-local`) to match `dsh.profile.bundles`, while
  the browser module id in `client/client.js` stays `dsh-memos-local`.

## [v2.0.19] (version alignment)

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
