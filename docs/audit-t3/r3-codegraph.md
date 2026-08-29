# T+3 R-3 报告：CodeGraph 跨项目噪音隔离评估

> 交付物 4 / 5 | 关联：`architecture-audit-2026-08-30.md` §9.1 R-3 | 日期：2026-08-30
> 状态：✅ 评估完成——噪音根因已定位，隔离方案已给，不实际重建索引（成本纪律 + 审计已用 Read 降级验证）

## 1. 问题复述（审计报告 §4.2）

审计期 `codegraph explore` 在 `M:/202608111/` 根目录扫描时优先命中 `AI-Butler/` 等参考项目（`route` symbol 命中 `AI-Butler/src/gateway/router.ts` 而非本项目 `src/agent/router-v2.ts`），10MB codegraph.db 与 11+ 参考项目共存导致查询噪音。审计方已降级为 `Read` 工具逐文件验证 import（§4.1 表 4-7 行）。

## 2. 现状核对（2026-08-30）

| 项 | 状态 |
|---|---|
| `.codegraph/` 是否入库 | ✅ 已在 `.gitignore`（`# CodeGraph 本地索引（不入库）`），数据库永不提交 |
| 当前是否初始化索引 | ❌ `codegraph status` 返回 `Not initialized`——审计噪音来自临时索引，非长期状态 |
| `codegraph init/index` 是否支持范围过滤 | ❌ CLI 无 `-p/--path` 选项（1.0.1），索引覆盖项目根全部目录 |
| 参考项目目录是否被 git 跟踪 | ❌ 未跟踪（untracked），但也不在 `.gitignore` |

## 3. 隔离方案评估

| 方案 | 做法 | 成本 | 评价 |
|---|---|---|---|
| **A（推荐）** | 将参考项目目录（`AI-Butler/`、`OpenHands/`、`Tavily+AnySearch+Bocha/`、`openocta/`、`opensquilla/`、`openworker/`、`v3/`、`crm/`、`benchmarks/`、`deepseek-harness/`、`agent-skills/`）加入 `.gitignore` | ¥0 | 一石二鸟：git status 不再显示 957 项参考噪音 + CodeGraph 索引自动排除（CodeGraph 尊重 .gitignore）；不修改参考项目本体，符合 AGENTS.md「只读」定位 |
| B | CodeGraph 配置文件 ignore（`.codegraph/config.json`） | ¥0~¥30 | 需验证 1.0.1 配置项支持；索引仍在项目根，风险未消 |
| C | 保持审计期降级：不依赖 CodeGraph，用 `rg`/`Read` 验证 import | ¥0 | 可用但放弃工具辅助，AGENTS.md 已注明「没有索引或输出不足时再用 rg」 |

## 4. 结论

- R-3 是工具辅助问题（LOW，无运行时影响，bench:na），不阻塞交付。
- 推荐方案 A：把 11 个参考项目目录加入 `.gitignore`（纯 git 忽略，不动参考项目本体）。**该动作涉及 `.gitignore` 变更，待 owner 拍板后执行**；执行后如需依赖图，再 `codegraph init`（仅索引 src/ + 配置文件，避开参考目录）。
- 当前代码依赖验证以审计报告 §4.1 静态 import 核对为准（✅ 已通过），无运行时风险。
