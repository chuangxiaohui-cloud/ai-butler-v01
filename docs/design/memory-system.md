# 记忆系统设计

> 权威需求：§8.1-§8.4；实现：`src/memory/`

## 1. 当前实现组成

| 组件 | 文件 | 数据 | 职责 |
|------|------|------|------|
| L0 记忆 | `store.ts` + `schema.sql` | `data/memory.db` | 原始问答，schema v1 冻结 |
| MemoryCoreStore | `memorycore-store.ts` | sidecar HTTP | 同接口同 schema，v0.2b 可切换 |
| ExperienceManager | `experience.ts` | `data/experience.db` | 经验检索、置信度演化、衰减、冷存 |
| L1 蒸馏 | `distill.ts` | ExperienceManager | DeepSeek 从 L0 提取 persona/episodic/instruction |
| UserContextStore | `user-context-store.ts` | `data/user-context.db` | user_profile / user_facts / session_summaries |
| Skill 生命周期 | `skills/lifecycle.ts` | `data/experience.db` 的 skill_stats | Skill 使用、反馈、冷存、复审 |
| MemoryCore 清理 | `memorycore-cleaner.ts` | sidecar | 清理历史 |

## 2. 声明性记忆 L0-L3

- L0：原始问答，`put` 同步，蒸馏异步。
- L1：项目侧蒸馏为 ExperienceManager 条目；MemoryCore 内置 L1 不作为主路径（E6 偏离）。
- L2：MemoryCore sidecar 蒸馏与场景知识；当前以 BM25 检索为主，embedding 后置。
- L3：长期画像由 UserContextStore 的 user_profile + user_facts 承担。

## 3. ExperienceManager 演化规则

- 置信度：初始 [P-32] 基线；使用 + 固定增量；👍 升 [P-72]；👎 降 [P-19]。
- 衰减：按 [P-30] 周衰减，时间基准为 lastUsedAt 或 createdAt。
- 冷存：超过 [P-31] 未用进入 cold，不参与自动检索。
- 复审：连续 👎 达到 [P-79] 标记 needsReview，检索时过滤。
- 检索：关键词/BM25 兜底，`confidence >= [P-32]`、非 cold、非 review。

## 4. UserContextStore schema

| 表 | 用途 | 关键列 |
|----|------|--------|
| `user_profile` | 用户画像 | user_id、role、current_projects、reply_style、tone |
| `user_facts` | 长期事实 | content、source、confidence、last_accessed_at、archived |
| `session_summaries` | 会话摘要 | session_id、summary、topics |

`session_summaries.summary` 当前写 `Q: 原文\nA: 回答`，供 rewrite 等上下文回溯使用；
L0 `memory.db` 按 `v0.1-cli:<userId>` 分会话，默认用户保持 `v0.1-cli`。
显式 `记住：...` 指令由 `extractRememberInstruction` 在路由前写入 `user_facts`
（source=`user_explicit`），不走搜索。

事实来源：`user_explicit` / `inferred` / `corrected`；衰减与归档复用
`confidence-decay.ts` 共享模块。

## 5. 异步蒸馏约束

- 蒸馏失败不阻塞主对话，保留 L0。
- 蒸馏结果本地持久化，离线可检索。
- SDK 调用超时 [P-42]；蒸馏 LLM 超时 [P-43]，与主对话隔离。

## 6. schema 冻结

`src/memory/schema.sql` 与需求 §8.4 对齐，v0.1 发布后冻结：只加列/加表，禁止改名/删列；
迁移脚本随版本附带。
