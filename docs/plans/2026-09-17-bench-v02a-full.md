# 推进计划：全量 bench:v02a（E417 / E19 后）

> 日期：2026-09-17 · 分支：v0.2b · 状态：**已完成**

## 目标

全量重跑 `npm run bench:v02a`，覆盖条件② 复跑时的旧答案（含 E19 `must_clarify`），确认 E417 后管道表现，并为可选 C.2 全量回填提供新报表。

## 执行

- `npm run build` + `npm run bench:v02a`（约 467s）。
- 修正 `scripts/bench-v02a.ts` 报告日期硬编码为运行日。
- `bench/v02a-report.md`：E19 相关性栏回填 **3**；注明判定沿用旧 scores。

## 结果

| 项 | 值 |
|----|-----|
| 总条数 | 31/31 有响应 |
| gate | none=22，low_confidence=6，safety=3 |
| confidence 中位 | 0.92 |
| 平均耗时 | ~14437ms |
| **E19** | **gate=none，conf=0.97，evidence=3，相关性=3**（不再 must_clarify） |

## 未做

- 其余 30 条本轮答案的 C.2 全量重评。
- 未提交 / 未 push（`bench/search-metrics.jsonl` 会胀，提交时按需决定是否纳入）。
