# 进度交接 2026-08-24（v0.2b 续作）

> 当前分支：`v0.2b`｜E228（Tavily [P-64] 口径复算）、E229（[P-13] 复测工具）、E230（[P-13] 初步实测）已提交。
> 上一份交接见 `docs/2026-08-23-progress-handoff.md`。

## 今日已收口

1. **Tavily [P-64] 口径复算（E228）**：E195 遗留矛盾（本地计数 634/1000 时远端已 HTTP 432 超限）
   收口——新增 `src/search/tavily-usage.ts`：`fetchTavilyUsage()` 拉取远端 `GET /usage`
   （Bearer 认证、3s 超时、失败静默、injectable fetch）权威用量快照；
   `scripts/tavily-smoke.ts` 配额报告段升级为「远端 /usage 权威 vs 本地尝试次数计数」对比
   （`limit:null` 不做 `remaining=limit-usage`，超额判定以远端 `usage>=1000` 或 provider 432 为准）。
   口径决策：本地 FileMonthlyQuotaStore 计数保留为「尝试次数」观察指标，权威超额判定由远端承载；
   [P-64]=1000 数值不变，§5 constraint 列与 §6.2.1 配额段落补注；附录 A 登记 E228（bench:B-20260824-01）。
   本会话真实探测：`/usage` usage=1000、limit=null、plan=Researcher，与 HTTP 432 相互印证。
   新增单测 5 条；全量单测 788/789 + 集成 15/15；doc-lint 0 FAIL 0 WARN。
   计划见 `docs/plans/2026-08-24-tavily-quota-recalc.md`。
2. **深度报告 [P-13] 复测工具（E229）**：新增 `scripts/deep-report-bench.ts` + `npm run deep:bench`——
   直调 `generateDeepReport`（合成证据、默认 3 节、budget=13s，口径不含内部搜索调用），
   `--dry-run` 离线 fallback 自检，默认模式 `createOptionalHeavyClient` 真跑；输出每轮耗时与汇总分位。
   dry-run 自检通过（3 轮 fallback 0ms）。附录 A 登记 E229（bench:B-20260824-02）。
3. **[P-13] 初步实测（E230）**：owner 批准 LLM 真跑 3 轮（deepseek-v4-pro）——**3/3 全 fallback 降级、
   2/3 超 13s 预算**（12008/13003/13015ms）；延迟探针单次 heavy 调用 8.5-9.4s（含 `<think>` 推理），
   深度报告 4 次顺序调用（大纲+3 节）结构性需 ~34-38s ≫ [P-13]=13s，共享预算下分节调用仅得剩余时间。
   **13s 与当前实现结构性不匹配**；[P-13] 维持 provisional（n=3<15）。待 owner 三选一：
   A 上调 [P-13]（如 40s，需连带改约束 P-14/P-15）；B 实现优化（分节并行 ≈18s 或换 flash 档）；
   C 维持 13s 接受 fallback 降级。附录 A 登记 E230（bench:B-20260824-03）。

## 明日继续（按优先级）

1. **[P-13] owner 决策**：三选一（上调预算+改约束 / 并行或换快模型 / 维持降级）；决策后补 n≥15 样本
   （`npm run deep:bench -- --samples 15`）按 E197 复验门评估晋升或调值。
2. **Tavily 9 月复核（备忘）**：9 月重置后跑 `npm run tavily:smoke`，确认远端 `/usage` 归零、
   本地计数重建，核对 [P-64] 计费口径。
3. **附录 A 行数预算**：E228-E230 各新增 1 行，当前 526/950 余量充足；后续按需 retention 压缩。
4. **OCR 残差 / 常规项**：已收口（E201 词典 + E205 网格补位），方向 3（超分）维持暂缓。
5. **v1.0 后续切片**：S1-S8 已全部完成（`docs/plans/2026-08-23-v1-slicing.md`）。
