# 推进计划：v1.0 切片后魔鬼训练 v2.5 主回归复核

> 日期：2026-08-24 · 分支：v0.2b · 状态：已完成（E237 主回归 + E238/E239 修复收口）

## 目标

v0.2b 验收（E206）与 v1.0 S1-S8 切片（E220-E227，含 [P-13]/[P-14] 预算校准、
深度报告并行化、记忆蒸馏、路由校准等大量行为变更）之后，主回归基准
`devil-v25`（122 条）最后一次全量跑分停留在 2026-08-17。本轮全量重跑并对比
旧基线，确认 v1.0 切片后无正确性/可用性回退，为 P-10 验收条件①「S1-S8 全功能
切片落地且回归绿」补齐离线可得的回归证据。

## 计划

1. 备份并移开旧 `bench/devil-v25/results.jsonl`（旧版保留在 git HEAD，供 compare 使用）。
2. 单条管线冒烟（`npm run dev`）确认 LLM + 双搜索 provider 当前可用。
3. 全量跑 `npm run bench:devil-v25`（122 条，单条超时 120s，增量落盘新 `results.jsonl`）。
4. `npm run baseline:devil-v25` 导出新基线 CSV + 摘要；`npm run compare:devil-v25`
   对比 HEAD 旧结果（35 条系统级 Bug + 8 条能力项逐条状态）。
5. 对照旧基线判定回归结论：总成功数、平均参考分、gate 分布、关键 Bug 项状态。
6. 登记附录 A E-NN（bench:B-20260824-NN）、补计划结果段、更新当日 handoff。
7. `npm exec tsx scripts/doc-lint.ts`（0 FAIL 0 WARN）+ 提交。

**验收标准**

- 122 条全量跑完，成功条数与旧基线可比（无大范围超时/失败）。
- compare 输出关键 Bug 项无新增「未修复」回归（与旧基线口径一致）。
- 附录 A 登记 E-NN + bench ID；doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- `bench/devil-v25/results.jsonl`：全量重跑（旧版在 git HEAD）。
- `bench/devil-v25/report.md` / `scoring-worksheet.md` / `scores.example.json`：随跑分重新生成。
- `bench/devil-v25/new-baseline-scores.csv` / `new-baseline-summary.md`：新基线导出。
- `src/skills/engineer/index.ts` / `src/skills/content-writer/index.ts`：生成 `maxTokens` 1500/1200→4000。
- `src/search/llm.ts` / `src/search/llm-client.ts` / `src/config/params.ts` / `src/main.ts` / `src/gateway/server.ts` / `scripts/bench-devil-v25.ts`：E238 修复。
- `src/search/query-rewrite.ts` / `src/search/search-loop.ts`：E239 修复。

### 遇到的问题

- **E238**：8/23 P17 审计引入的 [P-116]=12s 截断 engineer/content-writer 长文生成（实测 37-53s）；deepseek-v4-pro 思考模式下 maxTokens 1500/1200 全花在 think、正文为空。修复：`createSkillHeavyClient()`（per-call [P-122]=90s）+ `stripThinkBlock()` + maxTokens→4000。
- **E239**：`extractPartNumber` 把 IBIS/ULINK/ST-L 纯字母缩写误判为器件型号，datasheet 子查询挤出原查询 [P-85] 预算。修复：`datasheetPart()` 无数字不放行 + 原查询最先搜索。
- **环境性失败（非代码）**：C02/C10 首次重跑 deepseek HTTP 429 余额不足（瞬态，fallback 各 provider 均失败）；Tavily 本月额度耗尽（ET14/SM31 等 4 条残留兜底，9 月重置复核）。

## 结果

- **全量回归**：122/122 成功、0 超时、平均 14.3s、总耗时 1742s；compare 结论 **35/35 系统级 Bug 已修复、8 条能力项 6 条有进展**（ET14/C05 仍兜底，环境性）。
- **生成条目**：C02/E39/EC28/EC17/C10 重跑全部带正文、0 think 泄漏；残留 4 条兜底（ET20+ET14、SM02、SM31）为 Tavily 不可用/瞬态失败。
- **登记**：附录 A E237/E238/E239 + §5 [P-122]=90s；`bench:B-20260824-06`；`new-baseline-scores.csv`/`new-baseline-summary.md` 重新导出。
- **测试**：定向单测 49/49 + llm 10/10；全量单测 799/800（1 skip）+ 集成 15/15；build 通过；doc-lint 0 FAIL 0 WARN。