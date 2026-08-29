# 计划：M6 普通知识问答耗时纯读探针

> 日期：2026-08-29 · 对应架构审阅 M6（搜索并行优化前置探针）· 用户指定下一步

## 背景

审阅报告与 08-28 交接登记：普通知识问答耗时 33-50s/次，用户可感知的最慢路径。搜索 provider 层已是 `Promise.allSettled` 并行，剩余耗时疑似集中在子搜索串行循环、二次取证抓正文与 Stage 5 合成。本轮只做纯读探针，不调 API、不改任何参数，量化各阶段耗时后再决定是否立项优化。

## 计划

1. 新增 `scripts/probe-search-latency.ts`（只读）：解析 `data/trajectory.jsonl` 按 session 还原 route→search→synthesize→answer 各阶段耗时；解析 `bench/search-metrics.jsonl` 统计分引擎单次 stage 时延/timeout/degraded/cache。
2. 运行探针，输出会话级耗时分布与聚合统计 → 验证：脚本 stdout 合理、数据与已知 e2e（Q2 64.7s）可对照。
3. 结果落 `bench/B-20260829-02-search-latency-probe.md`，交接登记。

## 执行

- 新增 `scripts/probe-search-latency.ts`：按 session 还原 route/search/synthesize/answer 时间戳拆阶段；支持 `--limit`（最慢 N 条）、`--recent`（最近 N 条）、`--sinceDays`、`--summary`。
- 运行 `npx --no-install tsx scripts/probe-search-latency.ts --recent 3 --summary`，对照已知 Q2（64.7s）验证口径：search=26.0s、search→synth=29.4s、synth→answer=55ms，与 e2e 记录吻合。

## 结果

- build 绿；探针只读日志，无 API/参数改动。
- 近 7 天（n=262）：total avg 25.1s / p50 16.7s / p95 83.0s；search avg 8.3s / p95 46.3s；search→synth avg 12.6s / p95 26.1s；synth→answer p50 1ms。
- 分引擎（近 7 天 757 条）：单次 stage p50 825ms / p95 1870ms / max 4968ms；Bocha p50 147ms，AnySearch p50 1148ms——provider 不是瓶颈。
- 结论：瓶颈①复杂查询 Stage 3 串行子搜索（5 条子查询 + LLM 改写/judge），瓶颈② search→synth（P0 二次取证 + Stage 5 合成 LLM，轨迹无法再拆分）。
- 落盘 `bench/B-20260829-02-search-latency-probe.md`；交接登记。
