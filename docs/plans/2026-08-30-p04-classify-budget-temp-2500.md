# 推进计划：[P-04] 临时上调 1750→2500ms（provider 抖动期）

> 日期：2026-08-30 · 分支：v0.2b · 状态：已完成

## 目标

R-1 回归（`docs/audit-t3/r1-regression.md`）复跑 classify:smoke 实测 light 模型（deepseek-chat）延迟 median=3621ms / max=3718ms，远超 [P-04]=1750ms（定稿，E188）→ 5/10 query 触发 §6.1.2 降级 factual，准确率 5/10 < 验收线 80%。按审计报告 R-1 修复路径 1：**临时上调 [P-04]→2500ms**，等 provider 抖动平息后按 E1 复验门重新定稿回退。

## 计划

1. 新增计划文档（本文件）。
2. 修改 4 处（对齐注册表）：
   - 需求文档 §5.5 表 P-04 行：1750ms → 2500ms，状态「定稿」→「provisional@2026-08-30」（临时值未过复验门）。
   - `src/search/llm-registry.ts:115`：light 档默认超时 1750 → 2500。
   - `scripts/classify-smoke.ts:9,40`：默认显示 '1750' → '2500'。
   - `scripts/finalize-gates.ts:127`：E1 建议值上限 1750 → 2500（对齐注册表临时值；回退时同步改回）。
3. 附录 A 登记 E288（含预算交叉检查：Stage 各预算独立上限非可加约束，上调不击穿 [P-15]/[P-14]；E1 复验门：provider 恢复后 n≥30、超时率 ≤10%、准确率 ≥80%、p95×1.2 定稿回退）。
4. `npm run build` + `npm run doc-lint` + 重跑 `classify:smoke` 验证 ≥8/10。

**验收标准**

- classify:smoke ≥8/10（验收线 80%），S02/L05 仍走 `rule` 0ms。
- doc-lint 0 FAIL 0 WARN；build 通过。
- 4 处值一致（§5.5 ↔ llm-registry ↔ classify-smoke ↔ finalize-gates 均 2500）。

## 执行过程

### 改动

- 需求文档 §5.5 P-04：1750ms→2500ms，定稿→provisional@2026-08-30。
- `src/search/llm-registry.ts:115`：light 档默认超时 1750→2500。
- `scripts/classify-smoke.ts`：默认显示 1750→2500。
- `scripts/finalize-gates.ts:127`：E1 上限 1750→2500（对齐临时值，回退时同步）。
- 附录 A 登记 E288 + bench:B-20260830-01。

### 遇到的问题

- 无。

## 结果

- 验证：`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN；classify:smoke 复跑 **8/10 = 80%（达标）**，S02/L05 仍 rule 0ms
- 测试：（待填）
- 提交：待收口提交（E288 批）
- 遗留事项：provider 抖动平息后按 E1 复验门回退定稿；[P-04] provisional@2026-08-30 待重定稿。
- **owner 拍板记录（2026-08-30 下午）**：维持选项 A（2500ms，E288 已生效）。12:18 classify:smoke 单轮抽样 6/10、4/8 LLM 调用超 2500ms（4465-4602ms）→ provider 抖动未平息，回退 1750ms 将复现 5/10 降级；按审计矩阵 09-01（恢复 ≥7/10 → 进 E1 评估）/ 09-02（仍 ≥5/10 fallback → 确认维持 A）监控。审计方矩阵中 stageBudgets.classifyMs 为幽灵引用，真实修改点见 param-sample-30.md §3.4 勘误。
