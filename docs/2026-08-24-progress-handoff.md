# 进度交接 2026-08-24（v0.2b 续作）

> 当前分支：`v0.2b`｜E228（Tavily [P-64] 口径复算）已提交。
> 上一份交接见 `docs/2026-08-23-progress-handoff.md`。

## 今日已收口

1. **Tavily [P-64] 口径复算（E228）**：E195 遗留矛盾（本地计数 634/1000 时远端已 HTTP 432 超限）
   收口——新增 `src/search/tavily-usage.ts`：`fetchTavilyUsage()` 拉取远端 `GET /usage`
   （Bearer 认证、3s 超时、失败静默、injectable fetch）权威用量快照
   （usage/search/crawl/extract/map/research/plan/latency）；`scripts/tavily-smoke.ts`
   配额报告段升级为「远端 /usage 权威 vs 本地尝试次数计数」对比（`limit:null` 不做
   `remaining=limit-usage`，超额判定以远端 `usage>=1000` 或 provider 432 为准，远端不可达降级本地观察）。
   口径决策：本地 FileMonthlyQuotaStore 计数保留为「尝试次数」观察指标（调用前预增、失败也计数），
   权威超额判定由远端承载（432 已由 provider 拦截为 error+notice）；[P-64]=1000 数值不变，
   §5 constraint 列与 §6.2.1 配额段落补注口径语义；附录 A 登记 E228（bench:B-20260824-01）。
   本会话真实探测：`/usage` 返回 usage=1000、limit=null、search_usage=1000、plan=Researcher，
   与搜索调用 HTTP 432 相互印证（本月额度已耗尽，owner 确认等 9 月重置）。
   新增单测 5 条（tavily-usage 未配 key/401/200 完整与部分字段/异常）；全量单测
   788/789（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN。计划见
   `docs/plans/2026-08-24-tavily-quota-recalc.md`。

## 明日继续（按优先级）

1. **Tavily 9 月复核（备忘）**：9 月重置后跑 `npm run tavily:smoke`，确认远端 `/usage` 归零、
   本地计数重建，并核对 [P-64] 实际计费口径（news/advanced 是否多倍计费）。`tavily:smoke`
   本轮未在 owner 机器真跑（额度已耗尽且授权未通过），仅以本会话 `/usage` 探测与单测为证据。
2. **附录 A 行数预算**：E228 新增 1 行，余量充足；后续按需 retention 压缩旧条目。
3. **OCR 残差 / 常规项**：登加型（E201 词典）、FR407 单位（E205 网格补位）已解决；
   方向 3（超分）维持暂缓，方向 1（PP-OCRv6）已归档为不达标。
4. **v1.0 后续切片**：S1-S8 已全部完成（`docs/plans/2026-08-23-v1-slicing.md`）；
   [P-13] 保持 provisional，待真实使用实测按 E197 口径复测。
