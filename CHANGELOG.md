# Changelog

Notable changes to `dsh-memos-local`. Maintained by hand; for the full
per-commit history use `git log` or the GitHub releases page.

## [v2.0.21-dsh.2]

仅文档与版本号，无可执行代码变更（`dsh.1` 的 tag 先于文档更新产生，
故按「同一基线下的 fork-only 变更递增 `dsh.N`」的约定重发一版，
让 npm 包内附带的 README 含有运行时要求）。

### Docs

- README（中英）顶部声明 **Node.js >= 22** 的运行时要求：自 `v2.0.21-dsh.1`
  起 `better-sqlite3` 固定 13.0.3（Node-API 预编译），宿主运行时在打开存储前
  校验，Node 20 以 `MemOS requires Node.js >=22 in the actual host runtime`
  快速失败。
- 安装章节补充前置条件；新增「在旧运行时上固定版本」一节，说明 `latest`
  恒指向最新发布，Node 20 用户需显式安装 `@2.0.20-dsh.4`。
- 版本映射表补到 `2.0.21-dsh.2`。

## [v2.0.21-dsh.1]

上游基线 `2.0.20` → `2.0.21`（导入 `apps/memos-local-plugin` 子树 55 文件，
含 5 个上游提交）。DSH 适配、viewer 定制与本地算法定制全部保留。

### Breaking — 运行时要求提升（随上游 04bfa63d）

- **Node.js >= 22**（原 `>=20`）。`bootstrapMemoryCoreFull` 会在打开存储前
  用实际宿主运行时校验，Node 20 直接以
  `MemOS requires Node.js >=22 in the actual host runtime` 拒绝启动。
- **`better-sqlite3` 12.11.1 → 13.0.3**，改用官方 prebuild，不再需要本地
  编译（`gypfile: false` / `hasInstallScript: false`）。新增
  `scripts/normalize-sqlite-lock.cjs` 校验两份 lockfile 的元数据一致性。
- `@deepseek-ai/cordis` 的 dev 依赖放宽到 `~4.0.4`（实测 4.0.5 可用）。

### Added — 随上游 2.0.21

- **bundle 导入/导出**（`core/pipeline/bundle-import.ts` + `agent-contract/import.ts`）：
  可预览归属后再应用，导入前做校验。
- **本地嵌入进程隔离**（`core/embedding/providers/local-process*.ts`）：
  把本地模型推理放进独立进程，避免阻塞事件循环；Windows 下隔离原生 DLL。
- **本地模型配置可视化**：`local.remoteHost` / `modelPath` / `cacheDir` /
  `offline` 进入设置项，并可在 UI 里看到模型加载状态。
- 安装器：`install.sh` / `install.ps1`（原生支持 `--agent dsh --profile <name>`）、
  `scripts/verify-native-runtime.cjs`、`scripts/verify-script-policy.cjs`、
  `scripts/migrate-dsh-preset-profile.mjs`。
- 测试基建 `tests/helpers/deepseek-harness-v4.ts`（真实 V4 格式编解码校验）。

### Fixed — 自定义与上游契约的对齐

- **消息 source 只发 `kind`**：上游 `message-source.ts` 重新加回了 `plugin`
  字段，但 `dsh-session-format-v3-to-v4` 的转换器明确把
  `{kind:"plugin", plugin}` 改写为 `{kind:"plugin:<name>"}` 并**删除**
  `plugin` 键，V4 原生准入更直接拒绝该包装。保留 `plugin` 会把 V4 拒绝的
  形状带回来，故维持只发 `kind`，并同步三处测试断言。
- **工具面板走 SQL 聚合**：上游测试断言 `metrics/tools` 调用 `listApiLogs`，
  但本 fork 的定制改为调用 `aggregateApiLogsByTool`（`listApiLogs` 会被
  clamp 到 500 行，导致 >1h 窗口少算）。测试改为断言新路径。
- **本地模型缓存的 DSH 默认值**：`local-config.test.ts` 期望
  `~/.cache/memos/models`；本 fork 在 `DSH_HOME` 存在时默认落到
  `$DSH_HOME/memos-plugin/data/.model-cache`。测试改为按环境推导期望值。

### Kept — 本 fork 的本地定制（未被上游覆盖）

- `llm.maxTokens` 仍为 8192（L3 世界模型抽象需要，上游默认 1024）。
- 嵌入模型默认走 `hf-mirror.com`（`MEMOS_HF_MIRROR` 可覆盖，
  `MEMOS_HF_MIRROR_DISABLE=1` 可关闭），缓存默认落在 `DSH_HOME`。
- `aggregateApiLogsByTool` 与工具耗时面板（`core/util/percentile.ts`）。
- DSH 桌面端 Bearer 会话认证（PR #1 及其评审补丁）。

### Verification

- 全量测试：**172 文件 / 1483 通过 / 2 跳过 / 0 失败**。
- `tsc -p tsconfig.json --noEmit` 通过。
- 测试库迁移：14 个迁移全部应用，会话/episode 读写冒烟通过。
- 上游 `2.0.21` 无新增 DB 迁移（迁移集与 2.0.20 相同）。

## [v2.0.20-dsh.4]

### Added — DSH 桌面端的 Bearer 会话认证（PR #1，作者 @1234yqcg）

- `dsh-app://app` 协议转发会剔除响应里的 `Set-Cookie`（桌面壳自己托管 cookie
  jar），所以只依赖 cookie 的登录在桌面端"成功即失效"。`/auth/login` 与
  `/auth/setup` 现在同时返回 `{ ok, token }`，viewer 注入脚本把 token 存进
  `localStorage` 并以 `Authorization: Bearer` 重放；浏览器直连仍走 cookie。
- 服务端 `requireSession`、`/auth/status`、`/auth/reset` 支持 Bearer 回退。

### Fixed — token 的作用域与回退（评审补丁）

- 注入脚本只对**同源**请求附加 `Authorization`：不再把会话 token 带到
  `http://<host>:18799` 这类兄弟 agent 端口（`peers.ts` 明确要求
  `credentials: "omit"`），也避免给跨源请求平白增加一次 CORS 预检；token 的
  保存/清除同样做同源校验，防止任意 origin 的 `/auth/login` 响应覆写本地 token。
- cookie 先**验签**再采用，失效时回退到 Bearer：避免过期、旧 `sessionSecret`
  或 legacy `memos_sess` cookie 遮蔽有效 token，导致 AuthGate 卡在登录页循环。
- 新增 `tests/unit/server/auth-bearer.test.ts` 的负向用例（无效 cookie + 有效
  Bearer；同样的垃圾 cookie 单独出现仍应 401，作为反向控制）。

### Known — 未在本次处理，记为后续事项

- `/auth/logout` 不撤销服务端会话：token 在 7 天有效期内仍可重放。若要"退出即
  失效"，需要给 `AuthState` 加 `tokenEpoch` 并参与签名/校验。
- `enforceApiKey` 优先读 `Authorization: Bearer`，同时启用 `options.apiKey` 时
  session token 会把 API key 顶掉（401）；需要给 session 换独立 header 或调整
  中间件优先级。

## [v2.0.20-dsh.3]

### Fixed — DSH 0.2.1 compatibility

- **The DSH core gate rejected the plugin on 0.2.1-alpha.1** with
  `Plugin @steven-stack-s/dsh-memos-local@2.0.20-dsh.2 is incompatible with dsh
  0.2.1-alpha.1: peerDependencies {... <0.2.0 ...}`, so the bundle was skipped
  entirely (no recall, no capture, no `memos_*` tools). The upper bound is now
  `<0.3.0` for all six `@deepseek-ai/dsh-*` peers, which covers the 0.2.x line.
  - Note: an exact-version exemption
    (`dsh plugin allow-version <pkg@ver> --dsh-version 0.2.1-alpha.1`) only covers
    one `pkg@version` + DSH version pair and is re-tripped by any DSH upgrade or
    plugin reinstall; widening the range is the durable fix.
- Audited the 0.2.1 runtime surface the adapter actually uses. No code changes
  were required: `prepareCall(config, signal)`, `resolveModelInfo(provider,
  model, signal)`, `createUserMessage({ content, source })`, and
  `EpochHeader.config: LlmCallConfig` are all unchanged, and `deadline`,
  `timeoutOf`, and `defineTool` still resolve at runtime.
  - `@deepseek-ai/dsh-session` 0.2.1 deprecates the synchronous event reads
    (`eventAt`, `snapshotEvents`, `ownEvents`) in favour of asynchronous ones.
    The adapter does not call them — it consumes the `session/event` stream — so
    nothing had to change, but new code must not adopt the deprecated reads.

### Fixed — test suite no longer drifts from the live source contract

- `createRecallMessage` was inlined inside `apply()` and therefore untestable, so
  `deepseek-harness-bridge.test.ts` injected its own fixture. That fixture kept
  the retired `{ kind: "plugin", plugin: "memos-local-memory" }` shape after the
  0.1.7 fix landed, so 7 assertions were green while production had moved on.
  - Extracted `createDeepSeekHarnessRecallMessage(text)` as an exported producer
    (pure refactor: the runtime value is byte-identical) and pointed the tests at
    it; this exposed and fixed the 7 stale assertions.
  - `deepseek-harness-host-llm.test.ts` asserted the same retired shape and was
    failing outright; it now pins `{ kind: "plugin:memos-local-memory" }` and
    asserts the exact source object, since `toMatchObject` tolerates the extra
    `plugin` key that the contract removed.
- Added `tests/unit/adapters/deepseek-harness-source-contract.test.ts` as a guard.
  `MessageSourceMap` is merge-extensible and documents that "there is no shared
  catch-all `plugin` kind", so the guard pins the producer-owned kind, rejects the
  retired shell, and keeps the kind derived from the plugin identity rather than a
  literal. Verified in both directions: it fails when the old shape is restored and
  passes on the current code.

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
