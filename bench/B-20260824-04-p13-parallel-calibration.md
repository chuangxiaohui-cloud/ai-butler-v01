# Bench B-20260824-04：[P-13] 分节并行校准（E231，B 方案落地）

> 日期：2026-08-24 · 分支：v0.2b · 主题：深度报告分节并行 + per-call 预算修复 + [P-13]/[P-14] 校准

## 目的

落实 owner 决策 B（接 E230）：深度报告分节并行（4 次顺序 → 2 轮 RTT），并修复
「分节被 P-116 fallback 链预算（12s）按 complete 截断」的根因，使 heavy LLM 深度报告
在预算内真实完成（不再静默降级 fallback）。

## 测量过程（真实调用，deepseek-v4-pro）

| 阶段 | 配置 | 结果 |
|------|------|------|
| E230 基准（顺序 + P-116=12s + [P-13]=13s） | 顺序 4 调用 | 3/3 fallback、2/3 超时（B-20260824-03） |
| 根因定位 | 直连 heavy 客户端，per-call 预算 60s | 单节 25-29s（maxTokens=900，含 <think> 推理）；per-call 12s 必然截断 |
| flash（medium 档）对比 | 并行 3 节 | 7.4-27.5s（1 离群 27s，质量更低）→ 维持重模型 |
| **并行 + per-call=[P-13]=40s** | 大纲 1 次 + 3 节并行 | **3/3 source=llm、0 timedOut**：31030/33359/38990ms（avg 34460） |

## 校准结论

- 并行后真实完成 31.0-39.0s；40s 余量仅 ~1s（max 38990ms），偏紧。
- 按实测校准哲学（≈p95×1.2）：[P-13] 13s→**45s**、[P-14] 27s→**59s**（14+45=59，约束保持）。
- [P-13] 维持 provisional@2026-08-24（n=3<15），待 n≥15 样本按 E197 复验门评估晋升。

## 交付

- `deep-report.ts`：Stage B 分节并行（`Promise.all`，2 轮 RTT；仅大纲标题走 LLM，超出补 fallback；
  按序组装 + 顺序回调 `onSection`，恢复/逐节落盘语义不变）。
- `llm.ts`：`createDeepReportHeavyClient()`——per-call `totalBudgetMs=[P-13]`，避免 P-116(12s) 截断。
- `pipeline.ts`：深度报告分支接线专用 heavy 客户端。
- `params.ts`：`deepReportBudgetMs=45_000`；§5 P-13/P-14 同步。
- 单测：deep-report 并行 1 条 + llm 2 条。

## 结论

- B 方案落地：**LLM 深度报告增强路径恢复可用**（3/3 llm、0 超时）。
- 深度报告为「允许慢」长任务（§4.3.2，分阶段进度反馈），45s 预算在 [P-14]=59s 约束内。
- 测试：build + test:all 全绿；doc-lint 0 FAIL 0 WARN。
