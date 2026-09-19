# docs/ — developer-facing documentation

Developer docs for the `dsh-memos-local` fork. For *user-facing* help
(starting, configuration, viewer tour), see the plugin's [DeepSeek Harness
adapter guide](../adapters/deepseek-harness/README.md) or open the viewer's
*Help* page at runtime.

## Document index

| File | What it covers |
|---|---|
| `Reflect2Skill_算法设计核心.md` | The interaction-driven self-evolution framework (V7) — the core memory/reward/retrieval/skill algorithm spec (Chinese). |
| `GRANULARITY-AND-MEMORY-LAYERS.md` | Terms & granularity alignment: steps / turns / tasks vs. experience / world model / skill; scoring & retrieval granularity. Start here before other docs. |
| `ALGORITHM_ALIGNMENT.md` | Section-by-section algorithm ↔ implementation alignment table (✅/⚠️/❌). |
| `DATA-MODEL.md` | Every SQLite table, column, and index. |
| `CONFIG-ADVANCED.md` | Advanced `config.yaml` options. |
| `LOGGING.md` | Log channel taxonomy, redaction, retention. |
| `PROMPT-INJECTION-AND-RETRIEVAL-FILTER.md` | Prompt injection and retrieval filtering. |
| `MULTI_AGENT_VIEWER.md` | Viewer behavior with multiple agents. |
| `RFC-001-l2-induction-prompt-business-granularity.md` | RFC for L2 induction-prompt business granularity. |
