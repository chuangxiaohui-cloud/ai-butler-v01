# 推进计划：深度报告分节并行 + [P-13]/[P-14] 预算校准（E231）

> 日期：2026-08-24 · 分支：v0.2b · 状态：执行中

## 目标

落实 owner 决策（B 方案）：E230 初步实测显示 [P-13]=13s 结构性不足（heavy 单次 8.5-9.4s、
4 次顺序调用需 ~34-38s）。将深度报告分节生成改为**并行**（大纲 1 次 + 3 节并行 1 次 = 2 轮 RTT），
并按实测校准 [P-13]/[P-14]，使 heavy LLM 深度报告在预算内完成（不再静默降级 fallback）。

## 计划

1. `deep-report.ts` Stage B 改并行：`Promise.all` 并发发起剩余分节 LLM 调用（共享 [P-13] 预算
   与 AbortController），完成后按序号组装 + 顺序回调 `onSection`（保持恢复/落盘语义）。
2. `deep:bench` 支持 `--budget-ms` 覆盖，实测确定分节并行后 2 轮 RTT 所需预算。
3. §5 注册表 + params.ts 校准 [P-13]（13s→新值）与 [P-14]（27s→连带），保持 `P-15+P-13<=P-14`。
4. 单测补充：并行分节耗时≈max 而非 sum、部分节超时降级、恢复/回调顺序保持。
5. 真跑 n=3 验证（需网络授权）；附录 A 登记 E231（bench:B-20260824-04）；
   更新 handoff、code-directory（如涉及）、计划文档结果段。

**验收标准**

- doc-lint 0 FAIL 0 WARN（约束 `P-15+P-13<=P-14` 通过 C4）
- `npm run build` + `npm run test:all` 全绿
- 真跑 `npm run deep:bench`（n=3）：3/3 source=llm、无 timedOut，且总耗时 < 新预算
- 三段式提交（主体 → handoff → 计划补结果）

## 执行过程

### 改动

- `deep-report.ts` Stage B 分节并行：`Promise.all` 并发分节调用（2 轮 RTT），按序组装 + 顺序回调 `onSection`；
  仅大纲标题走 LLM，超出补 fallback；恢复/逐节落盘语义不变。
- 根因修复：分节此前被 P-116（`llmFallbackTotalBudgetMs=12s`，对齐 Stage 5）按 complete 截断——
  新增 `createDeepReportHeavyClient()`（per-call `totalBudgetMs=[P-13]`），pipeline 深度报告分支接线。
- 参数校准：[P-13] 13s→45s、[P-14] 27s→59s（§5 + params.ts `deepReportBudgetMs=45_000`；14+45=59 约束保持）。
- 单测：deep-report 并行 1 条 + llm 2 条；`deep:bench` 改用 `createDeepReportHeavyClient()`（与生产一致）。

### 遇到的问题

- 并行后仍 3/3 fallback：根因不是预算分配，而是 P-116 fallback 链 per-call 12s 预算把分节调用截断
  （单节 maxTokens=900 推理实测 25-29s）；直连探针定位后新增深度报告专用 heavy 客户端放开 per-call 预算。
- 40s 预算下 3/3 完成但余量仅 ~1s（max 38990ms），按 ≈p95×1.2 校准哲学取 45s。
- flash（medium 档）对比有 27s 离群且质量更低 → 维持重模型（§12.13 设计意图）。

## 结果

- 验证：`npm run deep:bench` 真跑 3 轮 **3/3 source=llm、0 timedOut**（31030/33359/38990ms）；
  doc-lint 0 FAIL 0 WARN（附录 527/950，约束 14+45=59<=59 通过）
- 测试：单测 791/792（1 skip）+ 集成 15/15（deep-report 并行 1 + llm 2 新增）
- 提交：`17a9676`（E231 主体）+ `2f2924e`（handoff 登记）
- 遗留事项：[P-13] 维持 provisional（n=3<15）；owner 真跑 `npm run deep:bench -- --samples 15`
  补 n≥15 样本后按 E197 复验门评估晋升。
