# 进度交接 2026-08-24（v0.2b 续作）

> 当前分支：`v0.2b`｜E228（Tavily [P-64] 口径复算）、E229/E230（[P-13] 复测工具+初步实测）、
> E231（分节并行+预算校准）已提交。
> 上一份交接见 `docs/2026-08-23-progress-handoff.md`。

## 今日已收口

1. **Tavily [P-64] 口径复算（E228）**：新增 `src/search/tavily-usage.ts`（远端 `GET /usage` 权威快照，
   Bearer 认证、3s 超时、失败静默）；`tavily:smoke` 配额段升级为远端 vs 本地尝试次数对比；
   口径决策：本地计数=观察指标、远端=超额判定（`limit:null` 不做 `remaining=limit-usage`）；
   [P-64]=1000 数值不变，§5/§6.2.1 补注。附录 A E228（bench:B-20260824-01）。
2. **深度报告 [P-13] 复测工具（E229）**：`scripts/deep-report-bench.ts` + `npm run deep:bench`
   （dry-run 离线自检 / LLM 真跑，`--samples`/`--budget-ms` 可调）。附录 A E229（bench:B-20260824-02）。
3. **[P-13] 初步实测（E230）**：真跑 3 轮 13s 预算 3/3 fallback、2/3 超时；单次 heavy 8.5-9.4s、
   顺序 4 调用结构性需 ~34-38s。附录 A E230（bench:B-20260824-03）。
4. **[P-13] 分节并行 + 预算校准（E231，B 方案落地）**：`deep-report.ts` Stage B 并行
   （大纲 1 次 + 分节 1 次 = 2 轮 RTT）；**根因修复**——分节此前被 P-116 per-call 12s 预算截断
   （单节实测 25-29s），新增 `createDeepReportHeavyClient()`（per-call=[P-13]）并在 pipeline 接线；
   参数校准 [P-13] 13s→**45s**、[P-14] 27s→**59s**（14+45=59 约束保持，实测 31.0-39.0s 后按 ≈p95×1.2）；
   flash 对比有 27s 离群 → 维持重模型。真跑 **3/3 source=llm、0 timedOut**。附录 A E231
   （bench:B-20260824-04）。新增单测 3 条；全量单测 791/792 + 集成 15/15；doc-lint 0 FAIL 0 WARN。

## 明日继续（按优先级）

1. **[P-13] 晋升样本**：owner 真跑 `npm run deep:bench -- --samples 15`（LLM 模式，需网络 + token）
   补 n≥15 真实样本，按 E197 复验门评估 [P-13]=45s 晋升或再校准（约束 P-15+P-13<=P-14=59s 内）。
2. **Tavily 9 月复核（备忘）**：9 月重置后跑 `npm run tavily:smoke`，确认远端 `/usage` 归零、
   本地计数重建，核对 [P-64] 计费口径（news/advanced 多倍计费）。
3. **附录 A 行数预算**：E228-E231 各 1 行，当前 527/950 余量充足；后续按需 retention 压缩。
4. **OCR 残差 / 常规项**：已收口（E201 词典 + E205 网格补位），方向 3（超分）维持暂缓。
5. **v1.0 后续切片**：S1-S8 已全部完成（`docs/plans/2026-08-23-v1-slicing.md`）。
