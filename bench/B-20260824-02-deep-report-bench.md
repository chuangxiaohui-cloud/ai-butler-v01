# Bench B-20260824-02：深度报告 [P-13] 复测工具就绪（dry-run 自检）

> 日期：2026-08-24 · 分支：v0.2b · 主题：E229——[P-13]（13s provisional）复测 harness 落地

## 目的

E197 复验数据包结论：「[P-13] 深度报告未落地无实测，维持 provisional，待实现后补测」。
深度报告已在 E220/E221 实现，本轮落地 `npm run deep:bench` 复测工具，先以 dry-run 离线自检
验证 harness，真实 LLM 样本由 owner 按需真跑（需网络 + token）。

## 口径

[P-13] = 深度报告增量预算（生成+证据组装，不含内部搜索调用）→ 直调 `generateDeepReport`
（合成证据、默认 3 节、`budgetMs=PARAMS.deepReportBudgetMs=13s`），测量 `elapsedMs` 与超预算占比。

## dry-run 自检记录（离线，零 token）

| 项 | 值 |
|----|-----|
| 命令 | `npm run deep:bench -- --dry-run` |
| samples | 3（STM32 选型 / 嵌入式 Linux 启动优化 / BLDC 电机库评估） |
| 结果 | fallback 组装 0ms ×3，sections=3，无 LLM 调用，timedOut=0 |
| 汇总 | min=p50=p90=max=0ms，>13000ms 0/3 |
| 判定 | ✅ 未超预算（fallback 路径天然快，仅验证 harness） |

## 交付

- `scripts/deep-report-bench.ts`：`--dry-run`（fallback）/ 默认（`createOptionalHeavyClient` 真跑）、
  `--samples N`、`--sections N`；输出每轮 source/elapsedMs/timedOut/sections + 汇总分位。
- `package.json`：`deep:bench` 脚本。

## 结论

- 复测工具就绪并可离线自检；[P-13]=13s 数值与状态不变（provisional）。
- 晋升复验门（§0 状态机）需 n≥15 真实样本：owner 真跑 `npm run deep:bench -- --samples 15`
  （LLM 模式，需网络与 token 成本），样本齐后按 E197 口径评估晋升。
- 测试：build + test:all 全绿；doc-lint 0 FAIL 0 WARN。
