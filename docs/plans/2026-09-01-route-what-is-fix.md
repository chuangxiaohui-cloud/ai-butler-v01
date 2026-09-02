# 推进计划：验收通过率缺口复验——「X是什么」误拦样本与 R016

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

复验 6 条「X是什么」类 reject 反馈样本：确认当前路由是否已修复误拦；若已修复，则补回归测试并翻转过期反馈，把 L2 验收通过率从被过期数据拖低的失真水平校正为真实水平。

## 计划

1. 排查 `router-v2` / `routing-table` / `intent-feature`：为何「X是什么」历史样本落入 `must_clarify` → verify: 定向跑 `routeV2` 复现 6 条样本
2. 若代码已修复（R016 命中 web_search），补回归测试覆盖 6 条历史样本 → verify: 定向单测绿
3. 用 `RouteCaseStore.batchMarkFeedback` 批量翻转 6 条 stale reject → verify: `maturity:check` 通过率变化
4. 登记附录 A E306 + 今日交接文档 → verify: `doc-lint` 0 FAIL 0 WARN

**验收标准**

- `routeV2` 对 6 条「X是什么」样本 → `direct` / secretary / web_search
- 单测覆盖 6 条历史样本且绿
- `data/route-cases.jsonl` 6 条反馈翻转为 accept
- `doc-lint` 0 FAIL 0 WARN

## 执行过程

### 排查结论（关键）

- 6 条 reject 全部来自 2026-08-13（timestamp 1786633711567 ~ 1786636377904），早于 R016 上线（`72e3e90`，2026-08-14）。
- 当时路由表无 `R016 { actionType: 'qa' }` → `candidates: []` → `must_clarify`「我没把握您要做什么，能再说具体一点吗？」。
- 当前代码 `routeV2` 对 6 条样本全部返回 `direct` → `R016:web_search:0.50`；第 7 条「帮我检查一下这个PCB的安全性」由 `option_clarify` 升为 `confirm`，top 命中 `R13`（owner/risk_review），与人工修正目标一致。
- **结论：误拦在代码层已于 08-14 修复（R016 + 既有「常识问答不再兜底澄清」单测），缺口是数据过期，不是代码缺陷。** 因此不做多余行为改动（AGENTS 简洁优先），只补回归样本 + 数据复验。

### 改动

- `src/agent/router-v2.test.ts`：既有「常识问答 → secretary/web_search」测试的 query 列表补 6 条历史 reject 样本。
- `data/route-cases.jsonl`（git 忽略，运行时数据）：6 条「X是什么」reject → accept（复验依据：当前 routeV2 结果与人工 `correctedRoute: secretary/web_search` 一致）。

### 遇到的问题

- 初始假设「代码需修复」被推翻：排查发现 R016 已于 08-14 上线。按仓库纪律改为「回归测试 + 数据复验」，不引入无意义代码。
- 第 7 条 PCB reject 未翻转：当前决策为 `confirm`（top 命中 owner/risk_review），已接近修正目标但非 `direct`，保留为观察项，由 owner 定夺。

## 结果

- 验证：`routeV2` 定向跑 6 条样本 → 全部 `direct` / web_search；`npm run maturity:check` 通过率由 73.9%（n=23）→ 100%（23/23，n 仍 <30，正式判定待样本达标）。
- 测试：router-v2 单测覆盖 6 条历史样本且绿。
- 提交：未提交（owner 未要求；代码改动仅测试 + 文档，数据文件 git 忽略）。
- 遗留事项：① 通过率 n 需 ≥30（差 4 条）；② 复用率 18.6%→60% 仍是 L2 主缺口；③ PCB reject 是否翻转由 owner 定夺。
