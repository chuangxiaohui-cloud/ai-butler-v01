# 推进计划：low_confidence 抽样复查与弱证据跟踪

> 日期：2026-08-18 · 分支：v0.2b · 状态：已完成

## 目标

复查 E125 融合阈值放宽后的 low_confidence 条目，判断是否引入低质证据，并把复查流程
固化为可重复脚本与报告，供后续每次基准跑分使用。

## 计划

1. 从 `bench/devil-v25/results.jsonl` 提取全部 low_confidence 条目。
2. 汇总证据数、分数分布、官方源占比、无证据兜底、自动分。
3. 抽样检查低分证据条目的答案与来源，区分“可信但分低”和“低质/跑题”。
4. 新增 `scripts/review-low-confidence.ts` 与 `npm run review:low-confidence`。
5. 输出 `bench/devil-v25/low-confidence-review.md`，更新交接。

**验收标准**

- 38 条 low_confidence 全部覆盖，7 条无证据、10 条含低于 0.4 证据被识别。
- 报告能回答“阈值放宽是否引入低质证据”。
- 脚本可重复运行，输出与报告一致。

## 执行过程

### 改动

- 新增 `scripts/review-low-confidence.ts` 与 npm script。
- 新增 `bench/devil-v25/low-confidence-review.md`。
- 新建 `docs/2026-08-18-progress-handoff.md`。

### 遇到的问题

- 7 条无证据中 P03 是“天气+芯片”多意图引导，不算兜底失败；其余 6 条是真兜底。
- 10 条含低于 0.4 证据，多数只是“分数低”，事实方向正确；真正跑题集中在 P01/P06/EC31。

## 结果

- 验证：`npm run review:low-confidence` 输出 38 条汇总；`doc-lint` 通过。
- 测试：新增脚本不涉及运行时行为，不新增单测。
- 提交：未提交。
- 遗留事项：无证据 6 条按官方源子查询/专业站直搜处理；P01 黑话、P06 城市缺失、EC31 陪伴类走专用分支。
