# 计划：trajectory 补 search→synth 内部阶段计时（M6 探针第二步）

> 日期：2026-08-29 · 承接 `2026-08-29-search-latency-probe.md` 的下一步建议

## 背景

B-20260829-02 纯读探针定位到两个耗时大头：Stage 3 串行子搜索循环与 `search→synth`（12-30s）。后者由 P0 二次取证抓正文 + Stage 5 合成 LLM 构成，但 trajectory 只有事件级时间戳，无法再拆分。本轮补内部阶段计时，让后续真实运行一次即可拆清 P0 fetch 与合成各自耗时。

## 计划

1. `src/trajectory/trajectory-log.ts`：`TrajectorySynthesize` 增可选 `secondPassMs` / `contentFetchMs` / `supplementMs` / `synthesisMs` → 验证：build
2. `src/search/pipeline.ts`：低置信二次取证、P0 知识正文抓取、数值补检索、Stage 5 合成四处加耗时埋点，写入 synthesize 轨迹事件 → 验证：pipeline 单测
3. `scripts/probe-search-latency.ts`：会话行展示 fetch/supplement/synth 细分，聚合新增 synthesisMs/contentFetchMs/supplementMs 统计 → 验证：脚本运行
4. 更新 M6 探针计划与交接 → 验证：手工核对

## 执行

- `trajectory-log.ts` 接口扩展；`pipeline.ts` 四处 `Date.now()` 埋点；synthesize 轨迹事件带 `synthesisMs`（必填）与其余可选字段。
- `pipeline.test.ts`：统一轨迹测试断言 `synthesisMs` 为数字；P0 测试断言 `contentFetchMs` + `synthesisMs` 为数字。
- 探针脚本展示 `fetch=... supplement=... synth=...` 并新增三组聚合统计。

## 结果

- `npm run build` 绿；pipeline 单测 49/49 绿（含新增断言）。
- 历史轨迹无新字段（n=0 聚合），真实数字待用户下次真实 CLI/gateway 运行后复跑探针即可拆分。
