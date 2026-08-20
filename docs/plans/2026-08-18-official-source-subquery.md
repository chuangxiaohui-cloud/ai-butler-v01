# 推进计划：官方源子查询与专业站直搜（无证据兜底修复）

> 日期：2026-08-18 · 分支：v0.2b · 状态：已完成

## 目标

解决 low_confidence 复查中 6 条真兜底（ET20/ET24/ET26/C01/E37/E38）搜索无结果问题，
通过“官方域子查询 + 专业站直搜”把有效证据带回融合。

## 计划

1. 扩展 `ruleBasedRewrite`：STM32/ADC/看门狗/PWM/RTOS/BUCK/Altium/SPICE 自动生成官方域子查询。
2. 扩展权威域表：`e2e.ti.com`、`community.st.com`、`freertos.org` 记为官方源。
3. 扩展 `buildEmptyFallbackQueries` 与浏览器/Tavily 兜底：空结果时优先官方域查询。
4. 补回归测试，用 CLI 真跑 6 条兜底题记录前后状态。
5. 登记 E128 与 `bench:B-20260818-01`，更新交接。

**验收标准**

- 6 条兜底题不再全部“我暂时无法确认”。
- 至少 4 条带回官方/专业站证据。
- 单测、集成、doc-lint 全绿。

## 执行过程

### 改动

- `src/search/query-rewrite.ts`：新增 `techOfficialQueries`，官方域子查询前置。
- `src/search/authority.ts`：新增技术题官方域映射与三个官方域。
- `src/search/search-loop.ts`：空结果回退候选和 Tavily 兜底覆盖技术域。
- 测试：query-rewrite 3 条、authority 2 条、search-loop 1 条。

### 遇到的问题

- C01 是“先回答再按说的加到工程里”的多轮执行，搜索修复只能让它升级为带上下文的澄清，
  真正写文件仍需上下文执行链。

## 结果

- 验证：`npm run build`、定向测试全绿；CLI 真跑 6 条，5 条搜索类全部带回证据。
- spot 基准：`bench/B-20260818-01-official-subquery.md`。
- 测试：单测 363/363 + 集成 17/17 全绿。
- 提交：未提交。
