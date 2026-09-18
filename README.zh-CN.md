# dsh-memos-local

> **DSH fork** of `@memtensor/memos-local-plugin`（MemTensor/MemOS）。
> 通过 `git subtree split` 从 MemOS 单体仓库的 `apps/memos-local-plugin`
> 独立出来，完整保留提交历史。
> 由 steven-stack-s 维护，专用于 DeepSeek Harness（DSH）。

[English](./README.md) | **简体中文**

---

## 这是什么

一套**本地优先、基于文件**的记忆系统，为智能体提供四层协作记忆，以及一套
由反馈驱动的"自我进化"循环：

- **L1 trace（轨迹）**——逐步的落地记录（动作 + 观测 + 反思 + 价值）。
- **L2 policy（策略）**——跨多条轨迹归纳出的子任务策略。
- **L3 world model（世界模型）**——由 L2 + L1 推导出的压缩环境认知。
- **Skill（技能）**——可直接调用的、被结晶的可执行能力。

插件从两条反馈通道持续学习：

- **步骤级**——模型 ↔ 环境（工具结果、观测差异）。
- **任务级**——人 ↔ 模型（显式评分 + 隐式信号）。

反思加权的奖励会沿每条轨迹反向传播，高价值的模式结晶为可复用的 Skill。
推理时，一个**三层检索器**（Skill → trace/episode → world model）在正确的
时机注入正确的上下文。

> 本 fork（DSH）的内存核心算法尽量与上游保持一致，以便 [subtree 同步](#与上游的关系subtree-同步)
> 时冲突最小化。本仓库的 `.`（包根入口）直接导出
> `dist/adapters/deepseek-harness/index.js`，即 DSH 专用的 Cordis 适配器；
> `openclaw`、`hermes` 等跨平台源码仍完整保留在 `adapters/` 下。

## 目录结构（概览）

```
adapters/deepseek-harness/ # DSH 的 Cordis 插件（服务端）——本 fork 的 DSH 入口
adapters/openclaw/         # OpenClaw 进程内 TS 适配器（保留源码）
adapters/hermes/           # 经 bridge.cts 通信的 Python 适配器（保留源码）
agent-contract/            # 与各适配器共享的稳定类型与 JSON-RPC 协议
core/                      # 与智能体无关的核心算法（记忆、奖励、检索、技能…）
server/                    # HTTP + SSE 服务（驱动 viewer）
bridge.cts + bridge/       # JSON-RPC 桥（Hermes Python 适配器使用）
client/                    # DSH 浏览器端 bundle（记忆页签、设置项）
viewer/                    # 运行时 Viewer（Vite，由 server/ 提供）
templates/                 # 安装时复制到用户主目录的 config.yaml 模板
docs/                      # 面向开发者的文档（算法、数据模型、提示词…）
scripts/                   # 构建 / 打包 / 发布辅助脚本
tests/                     # 单元 / 集成 / e2e（vitest）
```

完整的结构说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 与上游的关系（subtree 同步）

本仓库用 `git subtree split` 从 **MemTensor/MemOS** 单体仓库的
`apps/memos-local-plugin` 独立出来，保留了该子目录的完整提交历史。
同步上游 core 算法更新：

```bash
# remote "upstream" 已配置（只读）。拉取上游一棵完整的 monorepo tree：
git fetch upstream
# 把上游最新的 apps/memos-local-plugin 结点合并进来（subtree 合并）：
git subtree merge --squash -P . upstream/<branch>
# 或更精确地，用 --prefix 提取上游该子目录的最新内容后整体整合。
```

> 说明：core 算法逻辑尽量少改，以便 subtree 合并冲突最小化。
> DSH 相关的改动集中在 `adapters/deepseek-harness/`、`client/`、
> `package.json`（`exports`）等"发行层"；这些文件的冲突在合并时需要人工留意。

## 数据在哪里

运行时代码与用户状态是分开的。`install.sh` 会创建 OpenClaw 和 Hermes 的
home；DSH 通过 `dsh plugin` 把包安装到 profile，并在首次 boot 时初始化其
运行时 home：

| 智能体 | 代码安装到 | 运行时数据 + 配置在 |
| --- | --- | --- |
| OpenClaw | `~/.openclaw/plugins/memos-local-plugin/` | `~/.openclaw/memos-plugin/` |
| Hermes | `~/.hermes/plugins/memos-local-plugin/` | `~/.hermes/memos-plugin/` |
| DeepSeek Harness | 由 `dsh plugin` 管，为 profile 依赖 | `$DSH_HOME/memos-plugin/`（默认 `~/.dsh/memos-plugin/`） |

运行时目录内部：

```
config.yaml      # MemOS core 配置（含 API key；写入时 chmod 600）
data/memos.db    # SQLite（L1/L2/L3/Skill/Episode/Feedback/…）
skills/          # 结晶后的技能包
logs/            # 轮转日志（memos.log, error.log, audit.log, …）
daemon/          # bridge 的 pid/port 文件
```

DSH 在 **DSH 的 Node.js 进程内**直接运行 `MemoryCore` 和现有的 HTTP/SSE
Viewer，**不需要** JSON-RPC bridge 或 sidecar 守护进程。卸载插件**不会**删除
`data/`、`skills/`、`logs/`、`config.yaml`。升级后启动时可能迁移 SQLite
schema，升级前请备份运行时目录。

## 快速开始

> [!IMPORTANT]
> **不要执行 `npm install -g @memtensor/memos-local-plugin`。**
> 这是智能体插件包，不是独立 CLI。它通过 agent 专用的安装器来编排。
> OpenClaw / Hermes 用 `install.sh` / `install.ps1`；DSH 用 `--agent dsh`
> 或 DSH 底层的 `dsh plugin` 命令。

### DeepSeek Harness（DSH）

DSH 支持是一个"out-of-tree"的 Cordis bundle。一键安装器把包所有权与 bundle
协调交给 `dsh plugin`，同时处理 pnpm 的"已评审原生依赖构建"策略
（无需人工批准 `--approve-builds`）：

```bash
curl -fsSL https://raw.githubusercontent.com/MemTensor/MemOS/main/apps/memos-local-plugin/install.sh \
  | bash -s -- --agent dsh --profile web --version 2.0.16
```

如果 `pnpm` 不在 `PATH` 上，它会为该次安装准备一个隔离的 `pnpm@11.7.0`，
不改动用户的全局包管理器设置；安装器退出时会移除这个临时 pnpm。

从本地 checkout 开发，则构建后直接加进目标 DSH profile：

```bash
cd /path/to/dsh-memos-local
npm install
npm run build
dsh plugin --profile web add .
```

#### DSH 记忆页签与 Viewer

DSH 适配器默认把内存 Viewer（默认监听 `127.0.0.1:18801`）以 **`/memos`**
前缀挂到 **DSH 自己的 Web 服务器**上，因此你可以：

- 在 DSH 左侧栏的**「Memory」页签**中直接查看记忆内容（iframe 内嵌同源
  `/memos/`，无 Mixed-Content 问题）。
- 直接在浏览器打开（需先登录 DSH）：
  `https://<你的DSH域名>/memos/`

`/memos` 反代由 adapter 在 Viewer 启动后自动注册到 DSH 的 `webServer`；
它会注入 `<base href="/memos/">` 并劫持前端 `fetch`/`XHR`/`EventSource`，
让 Viewer 的绝对路径 `/api/v1/...` 正确落到 `/memos/api/v1/...`。

**DSH 记忆页签**（浏览器端）由 `client/client.js` 注册三块 UI：

| 界面 | Slot | 说明 |
|---|---|---|
| 主面板 | `main`（key=`memos`） | iframe 内嵌 `/memos/` 记忆查看器 |
| 侧边栏入口 | `sidebar.panellist`（id=`memos`） | 「Memory」按钮，与对话/轨迹并列 |
| 设置项 | `settings.section` | 「Memory (Memos)」配置 + Viewer 状态 |

> 记忆查看器自身如其启用了**密码保护**，首次进入时需在 Viewer 界面内输入
> 你设置的密码。这与 DSH 的登录是两套独立的认证。

DSH 的记忆检索策略：

- 每个被接受的非空直接用户回合执行**一次自动 recall**；检索结果以
  `memos-local-memory` 标签、排在 query 之前注入上下文。
- 模型还可额外调用 `memos_search` 做更短/改写的查询。
- 自动 recall 与 `memos_search` 共享同一绝对截止时间
  `min(recallTimeoutMs, 3000)` ms（默认 3000ms，只能缩短不能延长）。
- 捕获、关系、意图、摘要、embedding 都是后台工作，下一回合不会等待
  上一回合的队列。

详见 [DeepSeek Harness 适配器指南](./adapters/deepseek-harness/README.md)。

### OpenClaw 与 Hermes

安装器会自动检测 OpenClaw 和 Hermes。交互式终端会询问安装目标；非交互环境
则为检测到的 agent 安装。本地测试打包产物：

```bash
npm pack
bash install.sh --version ./memtensor-memos-local-plugin-2.0.16-beta.1.tgz
bash install.sh --agent openclaw --version ./memtensor-memos-local-plugin-2.0.16-beta.1.tgz
```

> 不要用 `openclaw plugins install ./package.tgz` 替换上面的命令：
> 裸归档路径可能解析出开发期专用的 DeepSeek 对等依赖并报 `ERESOLVE`。
> 升级 OpenClaw 本身前，先用 `openclaw doctor --fix` 迁移退役的宿主配置。

Windows 上用 PowerShell 执行 `install.ps1`（仅 OpenClaw/Hermes）。

### 故障排查

- **`npm install -g @memtensor/memos-local-plugin` 提示 404**：很可能是不小心把
  插件当独立 CLI 全局安装。请改用 `bash install.sh`（OpenClaw/Hermes）或
  `dsh plugin`（DSH）。
- **`web/` 或 `site/` 目录只有 README**：这些是过期目录名。运行时 viewer
  源码在 `viewer/`（原 `web/`），未完成的营销站脚手架 `site/` 已彻底移除。
  若看到只有 README 的目录，说明你在看一个已发布的 npm tarball，而非本仓库
  的完整源码。clone 仓库即可获得完整源码树。

## 配置

共享的 MemOS core 从运行时目录读取 `config.yaml`。各智能体的关键配置：

- **DSH**：`viewerEnabled`、`viewerPort` 在 profile 的 Cordis 行里；
  Viewer 绑定地址 `viewer.bindHost`（默认 `127.0.0.1`，只接受 loopback）
  在共享的 `config.yaml` 里。
- 运行时/配置位置按以下优先级解析：
  1. **`MEMOS_HOME`** 环境变量 —— 运行时根目录
  2. **`MEMOS_CONFIG_FILE`** 环境变量 —— 直接指向配置文件
  3. **适配器显式 home** —— DSH Cordis 行的 `home` 字段，或 `--home` bridge 标志
  4. **`DSH_HOME`**（仅 DSH）—— 默认 DSH 记忆根为 `$DSH_HOME/memos-plugin/`
  5. **默认路径** —— 按 agent 分别为 `~/.hermes/memos-plugin/`、
     `~/.openclaw/memos-plugin/`、`~/.dsh/memos-plugin/`

### Docker 部署

在 Docker 里跑 Hermes 守护进程时，必须显式指定配置位置。三种方式：

```dockerfile
# 方式一：环境变量（推荐）
ENV MEMOS_HOME=/opt/data/home/.hermes/memos-plugin
CMD ["node", "bridge.cts", "--agent=hermes", "--daemon"]
```
```dockerfile
# 方式二：CLI 标志
CMD ["node", "bridge.cts", "--agent=hermes", "--daemon", "--home=/opt/data/home/.hermes/memos-plugin"]
```
```dockerfile
# 方式三：CONFIG_FILE 直接指向配置文件
ENV MEMOS_CONFIG_FILE=/opt/data/home/.hermes/memos-plugin/config.yaml
CMD ["node", "bridge.cts", "--agent=hermes", "--daemon"]
```

出现 `config file not found at ...; using defaults` 时，检查 `config.yaml`
是否存在、`MEMOS_HOME`/`--home` 是否正确指向安装器创建的位置。配置缺失时
回退到默认（本地 embedding、无 LLM provider），轻量 trace 记忆仍可用，
LLM 依赖的反思与进化会被跳过或降级，直到配好 provider。

## 开发者文档

见 [docs/](./docs/README.md)——算法、数据模型、提示词、桥接协议、
日志、发布流程等的索引。
