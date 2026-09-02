# 推进计划：AI 运营成本感知最小闭环（§COST v1）

> 日期：2026-09-02 · 分支：v0.2b · 状态：已完成（代码闭环 2026-09-02 上午；§COST 文档整编当日下午追加）

## 目标

让老板能随时回答「AI 今天/本月花了多少钱」：在 E113 usage 记账（每次 LLM 调用 token 已落盘 `data/usage.jsonl`）之上补人民币估算、可配置预算阈值与硬停门禁、汇总报告。本轮先做「代码最小闭环 + 计划文档」，随后（同日追加）完成 §COST 文档整编：正文新增 §14、§5 注册表 P-143~P-148、附录 A E317。

## 计划

1. 单价表 `src/config/model-pricing.ts`：只登记 owner 已给价的模型（deepseek-v4-flash 0.10/0.10、deepseek-v4 1.0/2.0，¥/百万 token）；未知模型返回 null 诚实不计价 → 验证：build 绿 + 定向单测绿。
2. 扩展 `src/config/usage-budget.ts`：新增 `dailyBudgetCny / monthlyBudgetCny / hardStop`（缺省 null/false = 不启用，向后兼容，非破坏）→ 验证：usage-budget 单测绿。
3. 成本层 `src/usage/cost.ts`：`estimateCallCostCny` / `aggregateAiOpsCost` / 阈值告警文案（§COST C-4 的 50/80/100%）/ `assertNotHardStopped`（100% + hardStop 时抛错）/ 老板问答文案 → 验证：cost 单测绿。
4. `src/search/llm-client.ts` 接预调用门禁（仅当 hardStop 且日预算已配才生效，不配置零影响）；薄 CLI `scripts/ai-ops-cost.ts` + `npm run cost:today` → 验证：llm-client 门禁单测绿 + CLI 手动跑通。
5. 同步 `docs/code-directory.md` / `docs/directory-structure.md` 新模块登记 → 验证：`npm run build` 绿 + 定向单测全绿 + doc-lint 0 FAIL 0 WARN（未动需求文档正文）。

**验收标准**

- `npm run build` 通过；新增/改动单测全绿（model-pricing、cost、usage-budget、llm-client）。
- 不配置预算时行为与现状完全一致（非破坏）；配置后：日消耗 ≥100% 且 hardStop=true 时，LLM 调用在发请求前抛 `AI_OPS_BUDGET_EXCEEDED`。
- `npm run cost:today` 输出今日/本月人民币消耗、调用次数、未计价（待校准单价）调用数。
- 全程零外部 LLM/API 调用。

## 设计取舍

- **§COST 章节/§5 P-NN/附录 A 追加整编（2026-09-02 下午）**：owner 拍板「先代码最小闭环 + 计划文档」，完成后追加收口——正文新增 §14（AI 运营成本感知）、§5 注册表新增 P-143~P-148（日预算 5元/月预算 150元/黄 50%/红 80%/用尽·硬停 100%/DeepSeek 空闲折价系数 0.5，均 provisional@2026-09-02）、§13 代码目录登记 model-pricing/cost/ai-ops-cost、附录 A 增 E317；owner「开」= 代码默认启用日/月预算（hardStop 关），`params.ts` 新增 5 key 且 `usage-budget.ts`/`cost.ts` 真实读取（C8 登记即生效）。
- **单价按官方价目分档（2026-09-02 owner 提供）**：DeepSeek 输入分「缓存命中/未命中」两档、价格分「高峰/空闲」（空闲系数 0.5；高峰 = 北京时区周一至周五 9-12、14-18），flash/pro/vision-exp 已登记；智谱 GLM-5 无时段差价（offpeakFactor=1），glm-5.2/glm-5.3（2/8/28）与 glm-5-turbo（按单次输入整单跳档：<32K 为 1.2/5/22，≥32K 为 1.8/7/26）已登记；MiniMax API 按量计费无时段差价，按「实际收（永久五折后）」登记 M2.7（2.1/8.4/0.42）、M2.7-highspeed（4.2/16.8/0.42）、M3 ≤512K（2.1/8.4/0.42）。响应带缓存拆分时精确计价，缺拆分（旧记录）按缓存未命中上限估算并在报告注记。仍缺价 → 未计价单列，不编造数字。
- **硬停门禁放 llm-client（唯一 LLM 调用咽喉）**：预调用检查日消耗，成本可控且对 pipeline/Skill/IM 全覆盖；UI confirm/单次预估暂停（§COST C-4 ⏸️）依赖 E309 confirm 阻断式 UI，未做（已登记候选）。
- **不接通知枢纽/22:00 日报**：实时告警走通知枢纽与秘书日报属 E314–E316 的展示层后续（候选），本轮报告为 CLI/函数入口。

## 执行过程

### 改动

- `src/config/model-pricing.ts`（新）：官方分档单价表（缓存命中/未命中 × 高峰价 + 每项 `offpeakFactor`：DeepSeek 0.5 / 智谱与 MiniMax 1 + 可选 `byInputTiers` 整单跳档）+ `isPeakHourBeijing`（UTC+8 工作日 9-12/14-18）；登记 deepseek-v4-flash/pro/vision-exp + glm-5.2/glm-5.3/glm-5-turbo + MiniMax-M2.7/M2.7-highspeed/M3；未知/未确认模型返回 null 诚实不计价。
- `src/config/usage-budget.ts`：`UsageBudget` 增 `dailyBudgetCny / monthlyBudgetCny / hardStop`（缺省 null/false，非破坏）；`src/gateway/app.ts` PUT 改 `...current` 保留新字段。
- `src/usage/usage-store.ts`：`UsageRecord` 增可选 `cacheHitTokens/cacheMissTokens`（DeepSeek usage 缓存拆分，读写保留）。
- `src/usage/cost.ts`（新）：`estimateCallCostCny(record)`（按调用时刻高峰/空闲 × 缓存命中/未命中）/ `aggregateAiOpsCost`（今日/周/月/累计 + byModel + unpriced + pricedWithoutCacheSplit）/ `buildThresholdAlerts`（§COST C-4 黄50/红80/硬停100）/ `assertNotHardStopped` / `assertAiOpsGate`（文件注入）/ `formatAiOpsReport`。
- `src/search/llm-client.ts`：解析响应 usage 的缓存拆分字段随记录写入；`OpenAiCompatibleClientOptions` 增 `usageBudgetFile/usageLogFile`（usageLogFile 同时作记账输出路径，测试隔离）；`complete()` 发请求前调用 `assertAiOpsGate`（未配置预算零影响）。
- `scripts/ai-ops-cost.ts`（新）+ `package.json` `cost:today`：老板问答 CLI。
- 单测：`model-pricing.test.ts`（高峰判定 + 分档价 + 智谱/MiniMax/glm-5-turbo 档位）、`cost.test.ts`（6 条，含跳档示例 31K/33K 与无时段差价断言）、`usage-budget.test.ts` 扩展、`usage-store.test.ts` 增缓存字段读写、`llm-client.test.ts` 增门禁 2 条 + 缓存字段记账 1 条。
- 目录登记：`docs/code-directory.md`、`docs/directory-structure.md` 同步 model-pricing/cost/CLI。

### 遇到的问题

- `UsageBudget` 加必填字段后 gateway PUT 构造对象与 usage-budget 测试类型报错 → gateway 改 `...current` 保留新字段、测试补全字段。
- 集成测试首轮 1 例失败（未记录用例名），立即复跑两遍均 32/32 通过，判定为环境 flaky（INT-REPO 真实 git 远程），与本改动无关联。

## 结果

- 验证：`npm run build` 绿；doc-lint **0 FAIL 0 WARN**；`npm run cost:today` 输出今日 ¥0.00/本月 ¥0.07/1643 次（已计价 956，未计价 687）＋注记「956 条旧记录缺缓存拆分按未命中上限估算」＋模型明细 M3 ¥2.44 / flash ¥1.55 / pro ¥0.96 / M2.7 ¥0.39 等；全程零外部 LLM/API 调用。
- 测试：定向 **23/23**（model-pricing 2 + usage-budget 1 + usage-store 2 + cost 6 + llm-client 12）+ gateway 24/24（改动后复跑通过）；全量单测 **1293/1294**（1 skip 既有）；集成 **32/32**（复跑确认）。
- 提交：未提交（并入 E310–E316 批次，待 owner 拍板）。

## 遗留事项

- §COST 文档整编已完成（同日追加）：正文 §14 + §5 P-143~P-148 + §13 目录行 + 附录 A E317；doc-lint 0 FAIL 0 WARN（正文 1341/1800、附录 630/950、C8 75 key）、单测 1296/1297（1 skip 既有）+ 集成 32/32。随 E310–E316 批次统一提交（owner 拍板前不提交）。
- 预算已启用（2026-09-02 owner 拍板「开」，硬停关）：运行时 `data/usage-budget.json` 日 ¥5 / 月 ¥150 / `hardStop=false`；`cost:today` 已带预算行与状态。
- owner 2026-09-02 拍板：MiniMax-M3 >512K 上下文跳档与 glm-5.3-flash（含限时 5 折）均不登记（当前请求预算远低于 512K 阈值；glm-5.3-flash 非默认档）。deepseek-chat 已确认不用（历史遗留保持未计价）；旧记录缺缓存拆分按上限估算，新调用已精确。repo 直连 `api.minimax.chat` 按 API 价目计费，MiniMaxCode coding plan 订阅额度不覆盖直连 API 余额。
- 待 owner 确认启用预算默认值（日 ¥5 / 月 ¥150 草案）与 `hardStop` 初始开关；启用方式为写入运行时 `data/usage-budget.json`（git 忽略，非破坏）。
- 老板问答入口最终形态（pipeline/斜杠/通知枢纽右栏）与 ⏸️ 单次预估暂停确认（需 E309 UI）为后续候选。
