# 推进计划：继续攒路由校准样本

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

在校准样本 10/10 基础上继续补真实 pipeline case 的 accept/reject 标签，让校准结论更稳；本次补 8 条 accept + 4 条 reject，样本达到 22。

## 计划

1. 从 `data/route-cases.jsonl` 选出去重且未打标的明确案例。
2. 给 8 条正确搜索路由打 `accept`，给 4 条“该直答却 must_clarify”案例打 `reject` 并补 `secretary/web_search` 修正路由。
3. 跑 `npm run route:cases` 与 `npm run route:apply-calibration`。
4. 更新进度与计划文档，提交推送。

**验收标准**

- 校准样本 ≥20（accepted + rejected）。
- `route:cases` issues 为空。

## 执行过程

### 改动

- `data/route-cases.jsonl`（本地运行数据，不入库）：新增 8 条 `accept`（正确搜索路由）与 4 条 `reject`（该直答却 `must_clarify`，并补 `secretary/web_search` 修正路由）。

### 遇到的问题

- 无阻塞问题。

## 结果

- 校准样本 22/10（accept 15 / reject 7），`route:cases` issues 为空；`route:apply-calibration` 提案仍为 `routeConfidenceLow 0.45` / `routeConfidenceHigh 0.75`，未误伤 0.6 搜索。
- 无代码改动；doc-lint 0 FAIL/0 WARN。
- 提交：<hash> · 推送：Gitee / GitHub
- 遗留事项：继续攒真实 accept/reject 样本。
