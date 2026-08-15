# 推进计划：路由校准按决策类型细分

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

修复 `calibrateThresholds` 把“该直答却 must_clarify/option_clarify”的 reject 样本错误用于抬高 `routeConfidenceLow` 的问题：这类样本应降低澄清倾向，而不是让更多 0.6 的正确搜索变成澄清。

## 计划

1. `confidence-calibration.ts` 扩展 `CalibrationRecord`（带 `decision.type` 与 `correctedRoute`），reject 按决策类型分类。
2. 只有 `direct/confirm`（或缺少修正路由）的 reject 才参与抬高 low 阈值；`must_clarify/option_clarify + correctedRoute` 的 reject 不再抬高。
3. 补单测：该直答却澄清的 reject 不抬高阈值；原有 generic reject 用例保持通过。
4. 跑 `npm run test:all` 与 doc-lint。
5. 用本地 10/10 校准样本重跑 `route:apply-calibration`，确认提案不再把 low 抬高到 0.65。
6. 更新文档，提交推送。

**验收标准**

- 含 `must_clarify + correctedRoute` 的 reject 样本不会抬高 `routeConfidenceLow`。
- 本地校准提案 low 保持 0.45（或不再误伤 0.6 搜索）。
- 单测全绿，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- `confidence-calibration.ts`：`CalibrationRecord` 扩展 `decision.type` 与 `correctedRoute`；`calibrateThresholds` 只让 `direct/confirm`（或缺少修正路由）的 reject 参与抬高 `routeConfidenceLow`，`must_clarify/option_clarify + correctedRoute` 的 reject（该直答却澄清）不再抬高。
- 测试：`route-case-store.test.ts` 新增“该直答却澄清的 reject 不抬高 low 阈值”单测 1 条。

### 遇到的问题

- 原算法用所有 reject 的置信度 P75 抬高 low，会把“该直答却澄清”的 0 分案例也当成“要更谨慎”，误伤正常搜索；按决策类型过滤后修复。

## 结果

- 验证：10/10 校准样本重跑 `route:apply-calibration`，提案从 low=0.65 修正为 low=0.45 / high=0.75（与现值一致，不再误伤 0.6 搜索）。
- 测试：单测 255/255 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：<hash> · 推送：Gitee / GitHub
- 遗留事项：校准阈值保持 0.45/0.75；继续攒真实样本，样本更多后再校准。
