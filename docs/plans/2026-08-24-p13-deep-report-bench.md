# 推进计划：[P-13] 深度报告增量预算复测工具（E229）

> 日期：2026-08-24 · 分支：v0.2b · 状态：已完成

## 目标

承接 E197 遗留项：[P-13]（深度报告增量预算 13s，provisional）在深度报告实现（E220/E221）后
仍无真实运行样本。本轮落地 `npm run deep:bench` 复测工具（dry-run 离线自检 + LLM 真跑模式），
输出每轮耗时/source/timedOut 与汇总分位，供 owner 补 n≥15 样本后按 E197 复验门晋升。

## 计划

1. 新增 `scripts/deep-report-bench.ts`：调用 `generateDeepReport`（合成证据、默认 3 节、
   `--dry-run` 走 fallback 无 LLM 调用，默认读 `PARAMS.deepReportBudgetMs=13s`），
   输出每轮 elapsedMs/source/timedOut + 汇总（min/p50/p90/max、超预算占比、LLM/fallback 计数）。
2. `package.json` 登记 `deep:bench`。
3. 本机 dry-run 自检（离线、零 token），记录 bench:B-20260824-02 证据。
4. 附录 A 登记 E229（affects: §4.3.2,§5）；更新 code-directory、handoff。
5. [P-13] 维持 provisional；owner 真跑 `npm run deep:bench` 补 n≥15 样本后按复验门评估晋升。

**验收标准**

- doc-lint 0 FAIL 0 WARN
- `npm run build` + `npm run test:all` 全绿（单测基数 788/789，1 skip）
- `npm run deep:bench -- --dry-run` 离线自检通过（fallback source、无 LLM 调用）
- 三段式提交（主体 → handoff → 计划补结果）

## 执行过程

### 改动

- 新增 `scripts/deep-report-bench.ts`：直调 `generateDeepReport`（合成证据、默认 3 节、
  `budgetMs=PARAMS.deepReportBudgetMs=13s`），`--dry-run` 走 fallback（无 LLM 零 token），
  默认模式用 `createOptionalHeavyClient` 真跑；输出每轮 source/elapsedMs/timedOut/sections
  与汇总分位（min/p50/p90/max、超预算占比、llm/fallback 计数）。
- `package.json` 登记 `deep:bench`。
- 附录 A 登记 E229（affects: §4.3.2,§5）；`bench/B-20260824-02-deep-report-bench.md` 证据；
  `docs/code-directory.md` 登记脚本。

### 遇到的问题

- bench 脚本末尾提示行模板字符串内嵌套反引号导致 esbuild 语法错误，改为普通单引号字符串后通过。

## 结果

- 验证：dry-run 自检通过；owner 批准后 LLM 真跑 3 轮（E230，bench:B-20260824-03）：
  12008/13003/13015ms，3/3 fallback 降级、2/3 超 13s；延迟探针单次 heavy 8.5-9.4s（含 <think>），
  4 次顺序调用结构性需 ~34-38s ≫ 13s；doc-lint 0 FAIL 0 WARN（附录 526/950）
- 测试：单测 788/789（1 skip）+ 集成 15/15（无新增单测）
- 提交：E229 `471c414`+`284636e`；E230 `6fd898e`（主体）+`836aba9`（handoff 登记）
- 遗留事项：[P-13] 维持 provisional（n=3<15）；初步实测显示 13s 结构性不足，
  待 owner 三选一（A 上调预算+改约束 / B 并行或换快模型 / C 维持降级），
  决策后补 n≥15 样本按 E197 复验门评估晋升。
