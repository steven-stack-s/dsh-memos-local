# Bug 诊断报告：Viewer 总览计数有数据，点进去面板为空（对话一轮后自愈）

日期：2026-09-21
影响版本：`@steven-stack-s/dsh-memos-local` 2.0.19-dsh.1（DSH adapter）
现象：
- Viewer **总览**页「技能 / 经验 / 环境认知」卡片显示非零数字；
- 点进 `#/skills`、`#/policies`、`#/world-models` 面板却**列表为空**；
- **与 agent 进行一轮对话后再点进去，数据恢复正常。**

---

## 结论（一句话）

**命名空间不一致 + 列表/计数读取策略不对称。**

DSH 适配器的配置默认 `profileId: "default"`，但实际数据全部归属于
**`deepseek-harness/standard`**（由会话的 `agentPreset` 决定）。
进程刚启动、**尚未跑过任何一轮对话**时，core 的 `activeNamespace` 停在
`default`：

- **总览**的计数全部 pin 了 `includeAllNamespaces: true` → 忽略命名空间 → **有数字**；
- **面板**的列表路由**没有 pin** → 被 `visibleToCurrent(default)` 过滤掉 → **空**。

**跑一轮对话**后，bridge 会用会话的 `agentPreset="standard"` 调 core，
把 `activeNamespace` **翻转成 `standard`** → 面板立刻恢复。

这解释了"为什么对话一轮后自愈"——不是缓存刷新，而是**命名空间被翻转了**。

---

## 证据链

### 1. 数据归属 vs 配置，二者不一致

库里实际归属（直连 `/data/dsh/memos-plugin/data/memos.db`）：

| 表 | owner |
| --- | --- |
| traces | `deepseek-harness/standard` (1986)、`.../ptc` (8) |
| episodes | `deepseek-harness/standard` (426)、`.../ptc` (8) |
| policies | `deepseek-harness/standard` (89) |
| skills | `deepseek-harness/standard` (33) |
| world_model | `deepseek-harness/standard` (3) |

而配置里写的是：

```yaml
# adapters/deepseek-harness/cordis.patch.yml
- id: memos-local-memory
  config:
    profileId: default      # <-- 与数据不匹配
```

遍历 `/data/dsh/sessions/--workspace-code--` 下**全部** session header：

```
agentPreset 分布: { ptc: 16, standard: 7 }     # 从来没有 "default"
```

即 `profileId: default` 是模板自带的默认值，从未随实际 `agentPreset` 调整过。

### 2. 启动时用 `default`，运行时被 `agentPreset` 覆盖

`adapters/deepseek-harness/index.ts:301-303` —— 启动时按配置初始化：

```ts
core = await bootstrapMemoryCore({
  agent: DEEPSEEK_HARNESS_AGENT,
  namespace: { agentKind: DEEPSEEK_HARNESS_AGENT,
               profileId: config.profileId,      // = "default"
               profileLabel: config.profileId },
  ...
});
```

`adapters/deepseek-harness/bridge.ts:388-398`（`tools.ts` 同逻辑）—— 每轮对话用会话
的 `agentPreset` **覆盖**：

```ts
namespaceFor(session) {
  const preset = session.header?.["agentPreset"];
  const profileId = typeof preset === "string" && preset.trim()
    ? preset.trim()          // = "standard"
    : this.profileId;        // 兜底 = "default"
  ...
}
```

core 内部每次 turn/session 都会 `activeNamespace = namespace`（副作用式全局状态），
所以**一轮对话 = 一次命名空间翻转**。

### 3. 读取策略不对称 —— 这是"总览有数、面板为空"的直接原因

`server/routes/overview.ts`：**每一处计数都 pin 了** `includeAllNamespaces: true`
（第 49–77 行共 9 处），因此不受 `activeNamespace` 影响。

面板列表路由则相反：

| 面板 | 路由文件 | 列表是否 pin | 结果 |
| --- | --- | --- | --- |
| `/memories` | `server/routes/trace.ts` | ✅ pin（2 处） | 正常 |
| `/tasks` | `server/routes/session.ts` | ✅ pin（5 处） | 正常 |
| `/skills` | `server/routes/skill.ts` | ❌ **未 pin** | **空** |
| `/policies` | `server/routes/policies.ts` | ❌ **未 pin** | **空** |
| `/world-models` | `server/routes/policies.ts` | ❌ **未 pin** | **空** |

core 侧过滤逻辑（`core/pipeline/memory-core.ts`）：

```ts
// listSkills / listPolicies / listWorldModels
rows.filter((r) =>
  (input?.includeAllNamespaces || visibleToCurrent(r)) && matchesNamespaceFilter(r, input)
)
```

`visibleToCurrent(default)` 对 `standard` 归属的行返回 `false`（`.share.scope='private'`），
于是整页被过滤干净。

> 注意：这**不是**"跨命名空间隔离"设计缺陷，而是**配置里的
> `profileId` 与实际 `agentPreset` 不一致**所引发的连锁反应。
> 记忆/任务面板早年已按 #2131 修复（pin 了 includeAllNamespaces），
> 技能/经验/世界模型三个面板当时**漏改了**。

### 4. 实测复现（本仓库内可跑）

新增回归测试 `tests/unit/pipeline/repro-namespace-flip.test.ts`，
精确重现"启动为空 → 一轮对话后恢复"：

```
【启动时】  overview.countSkills(includeAllNamespaces) = 1
【启动时】  panel.listSkills()                        = 0     <-- 面板空
【一轮对话后】 panel.listSkills()                     = 1     <-- 恢复
```

运行方式：

```bash
TMPDIR=/tmp npx vitest run tests/unit/pipeline/repro-namespace-flip.test.ts
```

---

## 为什么"再对话一轮"就恢复（直接回答）

因为**一轮对话会触发命名空间翻转**：

```
启动       : activeNamespace = {deepseek-harness, default}   ← 配置值
总览       : count*(includeAllNamespaces=true)  → 89 / 33 / 3   ✅ 有数
面板       : list*(无 includeAllNamespaces)     → visibleToCurrent(default) 全滤 → 空 ❌
─────────────────────────── 与 agent 说一句话 ───────────────────────────
bridge     : namespaceFor(session) → agentPreset="standard"
core       : activeNamespace = {deepseek-harness, standard}   ← 翻转
面板       : list*() → visibleToCurrent(standard) 命中 → 89 / 33 / 3  ✅ 恢复
```

**副作用**：只要进程重启（或长时间无对话导致 viewer 重启），
`activeNamespace` 又会回到 `default`，**故障复发**——这与用户"过一阵又不行了"的
体感一致。

---

## 建议修复（按优先级）

1. **（治本，改配置）** 把 `adapters/deepseek-harness/cordis.patch.yml` 里的
   `profileId: default` 改成实际使用的 `standard`（或直接删掉该行，走运行时
   `agentPreset`）。
   ⚠️ 但更稳妥的是：**不要依赖静态配置**，见第 2 条。

2. **（治本，改代码）** 让 viewer 的**列表**路由与服务端口径一致：
   在 `server/routes/skill.ts`、`server/routes/policies.ts` 的
   `listSkills / listPolicies / listWorldModels` 调用中补上
   `includeAllNamespaces: true`（与 `overview.ts` / `trace.ts` / `session.ts` 对齐）。
   理由：viewer 是**本地单用户 admin 面板**，其聚合与列表本就应当反映整个库，
   这也是 #2131 已确立的约定；技能/经验/世界模型三个面板属于当时的遗漏。

3. **（健壮性）** `profileId` 的兜底不应是字面量 `"default"`，而应回落到
   当前会话的 `agentPreset` 或库中实际存在的命名空间，避免"配置与数据错位"
   再次静默发生。

4. **（可观测性）** `/api/v1/diag/namespace` 已能返回 `current` 与各命名空间行数；
   建议在 viewer 侧当 `current` 与库中主命名空间不一致时给出可见提示，
   而不是让用户看到"空列表"。

---

## 复现步骤（手工）

1. 重启 memos 插件（或整个 DSH），**先不要发任何消息**。
2. 打开 viewer 总览：技能/经验/环境认知**有数字**。
3. 点进任一卡片 → **列表为空**。
4. 回到对话里对 agent 说一句话（产生一轮 turn）。
5. 再点进同一面板 → **数据出现**。
6. 对照 `GET /api/v1/health` 的 `namespace.profileId`：第 3 步是 `default`，
   第 5 步变成 `standard`。

---

## 附：与上一版报告的差异

上一版曾把根因归到 `@xgone/dsh-remote` 的 `403 unauthorized`。
**该结论对"对话后自愈"这一新证据不成立**——会话过期不会因对话而恢复。
经复核，`dsh-remote` 的鉴权闸门确实存在（`/memos/*` 非 public，
无 `dsh_session` 时回 403），但它只在**会话失效**时造成另一个独立的
"整个面板空白"现象，**不是本次"总览有数、面板为空、对话后自愈"的根因**。
判定依据：本次现象发生在会话**有效**期间（总览能正常轮询取数），
且随命名空间翻转而**确定性恢复**。
