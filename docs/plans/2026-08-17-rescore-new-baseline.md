# 推进计划：新基线全量重跑与重打分（E126）

> 日期：2026-08-17 · 分支：v0.2b · 状态：已完成

## 目标

用 E125 之后的当前代码全量重跑 122 条魔鬼训练，形成新基线；保留旧评分表作参照，
重新生成报告、打分表和 A/B 对比，解决“旧定稿分只代表旧行为”的问题。

## 计划

1. 仅清空 `bench/devil-v25/results.jsonl`（保留 `scores.json` 与旧评分表做参照）。
2. `npm run bench:devil-v25` 全量重跑 122 条，生成新 report/worksheet/scores.example。
3. `npm run score-sheet:devil-v25` 重新生成打分表 CSV/MD。
4. `npm run compare:devil-v25` 对比 git HEAD 旧基线，记录 35 条系统级 Bug 与 8 条能力项状态。
5. 汇总新基线聚合指标（gate 分布、confidence、平均参考分），更新文档并提交推送。

**验收标准**

- `results.jsonl` 为 122 条新结果，无“待跑”条目。
- 新报告与打分表生成，旧评分保留为参照列。
- A/B 对比输出可读，能看出修复前后差异。

## 结果

- 全量重跑 122 条完成：平均自动分 1.59 → 1.73，0 分条目 17 → 12，
  “我暂时无法确认” 10 → 6；gate 分布 low_confidence=38 / none=79 /
  safety=3 / emergency=2。
- 35 条系统级 Bug 修复 35/35；8 条能力项 6/8 有进展（P03/C05 仍兜底）。
- 新增 `npm run baseline:devil-v25`，导出 `new-baseline-scores.csv` 与
  `new-baseline-summary.md`，作为新基线重打分的参照。
- 验证：主项目 build 与单测/集成全绿；doc-lint 通过。
- 提交：E126 已提交并推送 Gitee/GitHub。
