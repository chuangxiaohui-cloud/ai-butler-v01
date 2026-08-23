# Bench B-20260824-01：Tavily [P-64] 口径复算（远端 /usage vs 本地计数）

> 日期：2026-08-24 · 分支：v0.2b · 主题：E228——本地计数（尝试次数）与远端用量口径收口

## 目的

解决 E195 遗留矛盾：本地 `data/tavily-monthly.json` 计数 634/1000（63%）时，远端真实调用已返回
HTTP 432「plan usage limit」超限。本次引入远端 `GET /usage` 权威用量快照，明确口径分工：
本地计数＝尝试次数观察指标（调用前预增、失败也计数），远端＝权威用量与超额判定依据。

## 关键事实（本会话真实探测）

| 项 | 值 |
|----|-----|
| 远端 `GET /usage`（Bearer 认证） | `{"key":{"usage":1000,"limit":null,"search_usage":1000,"crawl_usage":0,"extract_usage":0,"map_usage":0,"research_usage":0},"account":{"current_plan":"Researcher"}}` |
| 真实搜索调用 | HTTP 432（key 有效但计划额度耗尽，provider 已映射 error+notice） |
| 本地月计数（尝试次数口径） | 2026-08 已用 634/1000 |
| 偏差结论 | 本地尝试次数 < 远端计费用量：失败尝试/触发前预增在本地计数，而 news/advanced 多倍计费与远端统计口径不同；**以远端为准** |

## 口径决策（E228 登记）

- 本地 `FileMonthlyQuotaStore.take` 保留为「尝试次数」观察指标（E195 起即调用前预增）。
- 权威超额判定：provider 已接 HTTP 432 → error+notice（熔断透出）；新增 `fetchTavilyUsage()`
  拉取远端 `/usage` 供 smoke 对比与告警复核。
- `limit:null`（无硬限字段）→ 不做 `remaining = limit - usage` 换算，仅用 `usage>=1000` 与 432 印证。
- [P-64]=1000 数值不变，§5 备注与 §6.2.1 配额段落补注口径语义。

## 交付

- `src/search/tavily-usage.ts`：`fetchTavilyUsage()`（Bearer 认证、3s 超时、失败静默、injectable fetch）。
- `scripts/tavily-smoke.ts`：配额报告段升级为「远端 /usage 权威 vs 本地尝试次数计数」对比；
  远端不可达时降级本地计数观察。
- 单测 5 条（tavily-usage 未配 key / 401 / 200 完整与部分字段 / 异常）。

## 结论

- 口径复算完成：**远端 `/usage` 与 HTTP 432 为权威，本地计数仅观察尝试次数**。
- 本月额度已耗尽（owner 确认），9 月重置后跑 `npm run tavily:smoke` 复核远端归零与本地计数重建。
- 测试：新增单测 5/5；全量单测 788/789（1 skip）+ 集成 15/15；doc-lint 0 FAIL 0 WARN。
