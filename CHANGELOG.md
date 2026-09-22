# Changelog

Notable changes to `dsh-memos-local`. Maintained by hand; for the full
per-commit history use `git log` or the GitHub releases page.

## [v2.0.20-dsh.2]

### Fixed — DSH 0.1.7-alpha.1 compatibility (Session format V4)

- **On DSH 0.1.7-alpha.1 every turn failed** with `format v4 message requires a
  producer-owned source kind`. 0.1.7 rejects the retired `source.kind === "plugin"`
  wrapper (`dsh-session-format-v3-to-v4` refuses plugin wrappers and demands a
  producer-owned kind), while the recall-context message and the host-LLM user
  message still used that old shape — so the `agent/pre-step` recall injection was
  refused on write and the whole turn aborted.
  - `adapters/deepseek-harness/index.ts` (`createRecallMessage`): the source kind is
    now `plugin:${DEEPSEEK_HARNESS_PLUGIN}` — what the official `producerKind()`
    derives for an unregistered producer — with the `plugin` field dropped and
    `form: "recall"` kept (that value is part of the 0.1.7 `ContextForm` vocabulary).
  - `adapters/deepseek-harness/host-llm.ts` (`toDshMessage`): same change for
    `HOST_LLM_MESSAGE_SOURCE`.
- Verified end to end on DSH 0.1.7-alpha.1: recall injection passes V4 admission,
  turns complete normally again, and the web boot reports zero inactive entries.
## [v2.0.20-dsh.1]

### Upstream sync

- Imported upstream MemOS **2.0.20** memory-evolution fixes (plugin subtree,
  commits `77c563cb..0f3265a5`): skill verification retry loops stopped with a
  6h cooldown default; L3 clustering bounded by `maxPoliciesPerCluster` (20)
  and `maxPromptChars` (32k) with failure backoff and quarantine; dedicated
  skill-evolver LLM now wired into L2 induction and skill crystallization.
- Storage migration `019-policy-metadata.sql` plus policy-metadata backfill.
- Hermes/OpenClaw installers and adapters remain out of scope for this fork.

### Added — tool-response-duration analytics

- `core/util/percentile.ts`: linear-interpolated p50/p95 (replaces inline floor
  indexing, which reported p50 above the mean and a full-width p95 on a single
  sample); percentiles are suppressed below `MIN_SAMPLES_FOR_PERCENTILE`.
- `core/storage/repos/api_logs.ts`: `aggregateByTool()` computes COUNT/SUM/AVG
  inside SQLite over the requested window, replacing the 500-row `limit`
  truncation that skewed the numbers to roughly the last hour.
- `server/routes/metrics.ts`: tool-duration aggregate endpoint with
  window/pagination parameters; Analytics view gains 5/15/30/60-minute window
  switching (default 5 minutes, persisted) plus p50/p95 bars and per-tool detail.

### Fixed

- `llm.maxTokens` raised 2048 → 8192: the structured-JSON slot also carries L3
  world-model abstraction, which needs thousands of output tokens; the old
  ceiling surfaced as `llm_output_malformed` and painted the model card red.

## [v2.0.19-dsh.4]

### Fixed — the summary and skill-evolver model cards reported "Not configured"

The overview model cards showed **未配置 / Not configured** for the summary
model and the skill-evolver model even though both slots were healthy and
actively serving. They also carried a red dot with

```
llm_output_malformed: DeepSeek Harness host LLM reached the token cap before completing
```

Two separate defects were behind that one screenshot.

**1. A host-managed slot is not an unconfigured slot.** The DSH host bridge
deliberately leaves `llm.model` empty — the *host* owns the model choice, so
there is no name for `config.yaml` to carry. The card rendered
`model || t("...unconfigured")`, so an empty name fell straight through to the
"Not configured" placeholder. The placeholder logic now lives in
`displayModelName()` and distinguishes the three real cases: a configured
name wins, a `provider: "host"` slot reads "Managed by DSH host" /
"由 DSH 宿主托管", and only a slot with nothing configured keeps the
"Not configured" wording.

**2. The token budget was too small for structured output.** `llm.maxTokens`
defaulted to **1024**, but that slot does not only summarise — it also carries
the structured-JSON calls (reflection synthesis, alpha scoring, L3
abstraction). A reasoning model spends output tokens *before* it emits any
JSON, so the budget was regularly exhausted mid-object and surfaced as the
`reached the token cap` error above. The default is now **2048**, kept
deliberately at half of the `l3Llm` / `skillEvolver` budget (4096) because
this slot sits on the turn path, where latency and cost matter more. Explicit
`maxTokens` overrides are unaffected, and the schema's real floor is
unchanged at 100.

The skill-evolver card mirrored the summary card because
`skillEvolver.provider` is empty, so it inherits the summary slot's config and
status. That inheritance is by design; the wording it renders is fixed here.

**Tests.** `tests/unit/viewer/overview-model-status.test.ts` covers the
placeholder rules (host-managed, genuinely unconfigured, configured, local
embedding); `tests/unit/config/llm-max-tokens-headers.test.ts` now pins the
2048 default with the reasoning recorded inline. Both were written to fail
first.

## [v2.0.19-dsh.3]

### Changed — publishing split: GitHub Packages is automatic, npmjs is manual

A tag push now **really publishes to GitHub Packages** and still only
*dry-runs* npmjs. Previously both were dry-run on tags, so the GHP mirror
silently fell behind — it stopped at `2.0.19-dsh.1` while npmjs had
`2.0.19-dsh.2`, and the profile had to be installed by hand.

The asymmetry is deliberate:

- **GitHub Packages — automatic.** Re-publishing an existing version returns a
  conflict instead of consuming the version number, so a mistake is cheap to
  retry. It is the mirror, so it should follow a tag with no human in the loop.
- **npmjs — manual.** A version number is burned the moment it is used:
  `unpublish` deletes the artifacts but leaves a tombstone in the packument's
  `time` table, and every later publish of that number fails with
  `400 Cannot publish over previously published version`. A bad publish cannot
  be undone, so it keeps requiring an explicit `workflow_dispatch` with
  `dry_run: false`.

Both workflows still verify the tag equals `v` + `package.json.version`, and
GHP keeps its `workflow_dispatch` entry (defaulting to dry-run) for rehearsals
and manual re-mirroring.

### Fixed — /diag probes followed the turn-scoped namespace

`GET /api/v1/diag/counts` and `GET /api/v1/diag/namespace` still scoped their
world-model reads to the active namespace. `/diag/counts` was the worse case:
it used `listWorldModels({ limit: 1 })` as a cheap "is there anything?" probe
and short-circuited the real count to `0` when the probe came back empty —
so a namespace mismatch made the diagnostic report an empty database while
the database was full. Both endpoints now pin `includeAllNamespaces: true`,
like the rest of the viewer surface (#2131).

### Changed — the profileId mismatch is now diagnosed instead of silent

`profileId` is only a *fallback*: a non-empty session `agentPreset` overrides
it for every turn. It still seeds the core's namespace at bootstrap, so when it
disagrees with the profile that owns the rows, namespace-scoped reads return
nothing until the first turn flips the namespace — the root cause of the empty
panels above.

The schema entry now documents that contract, and startup compares the
configured `profileId` against the owner of the rows in the database and warns
on a mismatch:

```
namespace mismatch — configured profileId "default" but the database's rows are
owned by "standard". Namespace-scoped reads will return nothing until the first
turn flips the active namespace. Set config.profileId to "standard" (or the
agentPreset you use) to align them.
```

Best-effort only: the probe never blocks startup.

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
