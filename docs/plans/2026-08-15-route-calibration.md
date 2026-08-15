# 推进计划：路由校准样本收集

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

把路由校准样本从 3/10 攒到 ≥10，并跑 `npm run route:apply-calibration` 生成阈值提案，供后续人工确认后写回 PARAM。

## 计划

1. 核对 `data/route-cases.jsonl` 中明确案例的决策与选中路由。
2. 给 5 条明显正确的搜索路由打 `accept`，给 2 条该直答却触发澄清的案例打 `reject`。
3. 跑 `npm run route:apply-calibration`，确认样本达标并生成 `data/calibration-proposal.json`。
4. 更新进度与计划文档，doc-lint，提交推送。

**验收标准**

- 校准样本 ≥10（accepted + rejected）。
- `apply-calibration` 返回 `ok: true` 并输出提案文件。

## 执行过程

### 改动

- `data/route-cases.jsonl`（本地运行数据，不入库）：给 5 条正确搜索路由打 `accept`（数据手册/在轨乘组/主频/版本号/行情），给 2 条“该直答却 must_clarify”的案例打 `reject`。
- 跑 `npm run route:apply-calibration` 生成 `data/calibration-proposal.json`。

### 遇到的问题

- 审计对“reject 缺少 correctedRoute”报 issue；直接给两条 reject 记录补上 `secretary/web_search` 修正路由后，issues 归零。

## 结果

- 校准样本 10/10（accept 7 / reject 3），`route:apply-calibration` 返回 `ok: true`。
- 提案：`routeConfidenceLow = 0.65`、`routeConfidenceHigh = 0.75`，待人工确认后写回 PARAM。
- 测试：无代码改动；doc-lint 0 FAIL/0 WARN。
- 提交：<hash> · 推送：Gitee / GitHub
- 遗留事项：阈值提案未回写；建议确认后登记 v2.5 PARAM 并跑回归。
