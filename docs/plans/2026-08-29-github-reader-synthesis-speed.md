# 推进计划：github-reader 合成速度修复（heavy→medium 档位切换）

> 日期：2026-08-29 · 分支：v0.2b · 状态：已完成

## 目标

用户复测 `https://github.com/deepseek-ai/deepseek-harness 这项目是做什么用的？`，连续三轮 synthesis 稳定 45.9–50s（totalMs 48–56s），确认是唯一剩余瓶颈。目标是让 github-reader 合成降到秒级（目标 <10s），且不回归已验收的答案质量（usage 能读到 `npx @deepseek-ai/dsh web`、定位/风险准确、confidence 0.65）。

## 背景（已只读排查确认的问题原因）

链路：`pipeline.ts` direct-skill 分支 → `github-reader/index.ts` execute → L1 抓取 → X.6 契约 → LLM 合成。

1. **抓取已不是瓶颈**：fetchMs 1.9–5.4s，数据层修复已闭环。
2. **瓶颈在合成**：synthesisMs 45.9s；`data/usage.jsonl` 最近一条 `deepseek-v4-pro, promptTokens=2774, completionTokens=2600`，而可见答案仅 ~800 字（≈1000–1300 tokens）——heavy 档 v4-pro 的隐藏 `<think>` 推理块与答案共享 max_tokens 预算（`llm-client.ts` 注释佐证），约一半输出 token 与绝大部分耗时耗在推理。
3. **三处生产入口硬编码 heavy**：`main.ts` / `gateway/server.ts` / `im/run.ts` 的 `skillDeps.complete` 全部是 `createSkillHeavyClient() ?? createHeavyClient()`（v4-pro）；市场通道 `github-project.ts` 默认同样 heavy。
4. **档位落后于主链路**：E278 已把 CLI 主链路默认档改为 medium（v4-flash，[P-116] 18s），主管道秒级完成；skill 合成档位仍停在 heavy。
5. **测试隔离约束**：pipeline 单测注入 complete mock；`loadEnvFile` 会把 `.env` 的 key 回填进 `process.env`，若在 pipeline 无条件构造真实 client，单测会变真网络调用。因此档位决策放生产接线层（SkillDeps 新增按 skill 名解析器），测试注入未提供该字段时回落注入 mock。

## 计划

1. `llm.ts` 新增 `createSkillCompleteClient(skillName)`：github-reader → `createOptionalMediumClient() ?? heavy`；其余 → heavy（E238 长文生成需 [P-122] 90s 预算，不变）→ 验证：llm 单测
2. `deps.ts` SkillDeps 新增可选 `completeForSkill?: (skillName) => LLMClient | undefined` → 验证：build
3. `pipeline.ts` direct-skill 分支：`completeForSkill?.(skillName) ?? complete` 解析后统一包 `withStreamingToken`（onToken 改可选，非流式入口 gateway/im 同样生效）→ 验证：pipeline 单测（新增 completeForSkill 优先用例）
4. `main.ts` / `gateway/server.ts` / `im/run.ts` 接线 `completeForSkill: createSkillCompleteClient` → 验证：build
5. `github-project.ts` 市场通道默认改 `createSkillCompleteClient('github-reader')` → 验证：github-project 单测
6. 文档：计划 + 附录 A E283 登记 + progress-handoff 链接 → 验证：doc-lint

**验收标准**

- `npm run build` 绿；llm / pipeline / github-reader / github-project 目标单测全绿；全量 `npm run test:all` 绿；`npm run doc-lint` 0 FAIL 0 WARN
- 不复跑 bench / e2e（成本纪律）；用户手动复测 deepseek-harness query 时 synthesisMs 降到秒级（目标 <10s）
- 答案质量不回退：usage 仍读到 `npx @deepseek-ai/dsh web`、定位/风险准确、confidence 0.65

## 执行过程

### 改动

- `src/search/llm.ts`：新增 `createSkillCompleteClient(skillName)` 档位工厂——github-reader → `createOptionalMediumClient() ?? createSkillHeavyClient() ?? createHeavyClient()`（v4-flash），其余 skill → `createSkillHeavyClient() ?? createHeavyClient()`（E238 [P-122] 预算不变）。
- `src/skills/deps.ts`：`SkillDeps` 新增可选 `completeForSkill?: (skillName) => LLMClient | undefined`。
- `src/search/pipeline.ts`：direct-skill 分支改为 `completeForSkill?.(skillName) ?? complete` 解析后统一包 `withStreamingToken`；`withStreamingToken` 的 onToken 改可选（无 onToken 时透传原样，gateway/im 非流式入口同样换档生效）。
- `src/main.ts` / `src/gateway/server.ts` / `src/im/run.ts`：三生产入口接线 `completeForSkill: createSkillCompleteClient`。
- `src/skills/market/github-project.ts`：默认 LLM 合成从 `createSkillHeavyClient()` 改为 `createSkillCompleteClient('github-reader')`（同一 github 解读任务，档位口径一致）。
- `src/search/llm.test.ts`（+1）：`createSkillCompleteClient` github-reader 走 medium（v4-flash）/ engineer 维持 heavy（v4-pro）档位断言（env 注入，含 model env 保存/恢复）。
- `src/search/pipeline.test.ts`（+1）：github-reader 经 `completeForSkill` 按名解析合成客户端，优先于注入 complete。

### 遇到的问题

- 无（方案在动手前已确认测试隔离约束：不能在 pipeline 无条件构造真实 client——`loadEnvFile` 会把 `.env` key 回填进 `process.env`，单测会变真网络调用；档位决策放生产接线层 `completeForSkill`，测试注入不提供该字段时回落 mock）。

## 结果

- 验证：`npm run build` 绿；llm 单测 8/8、pipeline 53/53、github-project + github-reader 25/25；`npm run test:all` 退出码 0（集成 32/32）；`npm run doc-lint` 0 FAIL 0 WARN。
- 测试：单测目标文件全绿 + 集成 32/32。
- 提交：未提交（工作区含 E275-E283 大量未提交改动，提交前需 doc-lint + test:all 全绿）。
- 遗留事项：真实 `npm run dev` 复测待用户手动（成本纪律不代跑）：期望 synthesisMs 由 45.9s 降到秒级、答案质量与 confidence 0.65 不回退；medium [P-116] 18s 在 API 抖动时仍可能触发结构化契约兜底（诚实降级，非错误）。
---

## E283 修订（18s 预算不足：medium 默认 [P-116] 会截断正在生成的答案）

### 背景

E283 落地后用户复测：synthesis 只跑了 18,008ms 即被「LLM fallback 链总预算 18000ms 超时」中止，触发模板渲染兜底（confidence 0.5）；但 stderr 流式内容显示答案已高质量生成约 70%（一句话结论/定位/架构/使用/活跃度/风险/建议/仍需确认结构完整，被截断在「仍需确认」前）。结论：medium 档默认 [P-116] 18s 总预算对 github-reader 这类「契约渲染 + ≤1200 字」合成在 API 抖动时余量不足，把正在生成的答案杀掉了——不是模型慢到不可用，是预算太短。

### 修复

`src/search/llm.ts` `createSkillCompleteClient`：github-reader 分支不再用 `createOptionalMediumClient()`（继承 [P-116] 18s），改为 `createClientForRole('medium', { totalBudgetMs: [P-122], timeoutMs: [P-122] })`——模型仍为 v4-flash，预算与 skill 长文档位（engineer/content-writer）同一口径 90s；**不动全局 [P-116]**（E281 校准的主链路 18s 语义保留）。

### 结果

- `npm run build` 绿；llm 单测 8/8（E283 用例追加 github-reader 预算 = [P-122] 断言）。
- 用户复测期望：合成不再被 18s 截断，v4-flash 完整生成（预计 ~20-35s，视 API 吞吐），模板兜底只应在真正的 provider 故障时出现。
- 遗留：若 20-35s 仍超用户体感阈值，下一档优化是协议输出限长（如 1200→800 字）或 readme_excerpt 截短，属质量/速度权衡，需用户拍板。