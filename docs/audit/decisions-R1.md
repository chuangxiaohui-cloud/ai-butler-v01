# R-1 [P-04] LLM 分类超时阈值调整决策

- **日期：** 2026-08-30
- **决策人：** 老张
- **状态：** Provisional（待 Provider 恢复后复评）

## 1. 背景与问题

近期观察到 Provider（deepseek-chat）抖动持续超过 3 天，导致 classify 任务 fallback 率升高。
09-01 实测准确率 6/10（60%），4 例 Fallback 均由 LLM 响应超时引起（耗时 4700ms–5000ms），
远超 1750ms 阈值，影响业务稳定性。

## 2. 决策选项分析

### 选项 A — 维持 2500ms（采纳）

- **内容：** 维持当前 `LLM_CLASSIFY_TIMEOUT_MS` 默认值 2500ms，不做回退。
- **理由：** 09-01 实测 6/10，未达矩阵"恢复 ≥7/10 → 选 B"的信号。
  若回退至 1750ms 将立刻复现 ≥5/10 fallback 降级。
- **代码落点：** `src/search/llm-registry.ts:115`（resolveTimeoutMs → light 档默认 2500ms），
  由环境变量 `LLM_CLASSIFY_TIMEOUT_MS` 驱动。
- **关联同步点：** `scripts/classify-smoke.ts`（日志显示）、`scripts/finalize-gates.ts:127`（E1 建议值上限）。

### 选项 B — 回退至 1750ms（拒绝）

- **内容：** 将超时阈值回退至 1750ms。
- **理由：** 当前 Provider 抖动尚未平息，回退将导致服务不可用。

## 3. 执行验证

- **代码状态：** E288 已将选项 A 落地（`llm-registry.ts:115` / `classify-smoke.ts` / `finalize-gates.ts:127` 四处一致），本次无需代码变更。
- **09-01 实测结果：** `npm run classify:smoke -- --rounds=1`
  - 准确率：6/10（60%），未达 ≥80% 验收线
  - 失败案例：E06 / E11 / E14 / E16，均为 LLM 响应 >4.7s 触发 Fallback
  - 结论：Provider 抖动未平息，维持 A

## 4. 文档勘误

- `docs/audit-t3/param-sample-30.md` 第 1 行：幽灵引用 `stageBudgets.classifyMs = 1750 (src/agent/pipeline.ts)` 修正为真实实现 `LLM_CLASSIFY_TIMEOUT_MS` env / `resolveTimeoutMs()` light 默认（`src/search/llm-registry.ts:115`），值 1750→2500ms，状态 定稿→provisional@2026-08-30。
- `docs/audit-t3/param-sample-30.md` §3.3：批次数 "共 10 项" 修正为 "共 20 项（P-82/P-84~P-86/P-89~P-104）"。
- 上述勘误统一记录于 §3.4。

## 5. 后续计划

- **09-02 复测：** 运行 `npm run classify:smoke -- --rounds=1`
  - 若 ≥7/10 → 启动回退评估（进入稳定窗口测试，攒 n≥30）
  - 若 <7/10 → 继续维持 2500ms，次日再测
- **最终目标：** 待 Provider 抖动平息、稳定窗口验证通过后，回退至 1750ms 并重定稿。