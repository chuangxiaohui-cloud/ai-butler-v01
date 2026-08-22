# Bench B-20260822-07：Tavily 触发冒烟 + 配额监控（E195）

> 日期：2026-08-22 · 对应 E195（§6.2.1 Tavily 条件并联触发路径冒烟 + [P-64] 配额可见性）

## 目的

验证 Tavily 触发路径真实可用（key 配置 / shouldTriggerTavily / runSearchStage 注入并行），
并把月度配额 [P-64]=1000 用量/剩余变为可见，供成本与质量预期管理。

## 实测记录（真实调用）

| 项 | 值 |
|----|-----|
| TAVILY_API_KEY | 已配置（58 字符，不显示值） |
| 触发判定样例 | english ×3（版本号/主频/编译报错）、news ×1（A 股行情）、low_confidence_hint ×1（PCB 踩坑）、严肃通道 none ×1（高血压，禁区熔断正确） |
| 真实链路（runSearchStage 注入 Tavily） | ❌ HTTP 432，782ms，结果 0 |
| 本地月配额 | 2026-08 已用 634/1000（63%），剩余 366 |

### 关键发现：HTTP 432 = Tavily 计划用量超限

- 直接探测响应体：`{"detail":{"error":"This request exceeds your plan's set usage limit. Please upgrade your plan or contact support@tavily.com"}}`
- key 有效（非 401），但远端计划额度已耗尽 → **Tavily 条件并联路径本月实际不可用**，
  按设计静默熔断（其余引擎顶上，不影响 Bocha/AnySearch）。
- 本地计数 634/1000 与远端超限矛盾：实际计划额度 <1000 或 news/advanced 按多倍计费
  （基准曾用 news/advanced），**需按实测复算 [P-64] 口径**（改为按远端 credits 或下调本地上限）。

## 交付

- `npm run tavily:smoke`：key 检查 + 触发判定 + 真实链路 + 配额报告（432 单独识别为「计划用量超限」）。
- `src/search/quota.ts`：`readMonthlyQuota()` 只读快照 + `TAVILY_MONTHLY_LIMIT` 常量单源化
  （s3_search/search-loop 本地硬编码 1000 删除）。
- `src/search/providers/tavily.ts`：HTTP 432 → 明确 error + `notice`（复用 E192 告警透出模式，
  CLI stderr / gateway notices 可见「Tavily 计划用量已超限」）。

## 结论

- 触发判定与配额报告链路可用；**Tavily 当前处于配额超限（432）状态，需 owner 决策**：
  A) 升级 Tavily 计划；B) 等下月重置（8 月剩余时间无 Tavily 质量增强）；C) 复核 [P-64] 口径与本地计数。
- 单测：quota 6/6（含 readMonthlyQuota 缺失/当月/跨月/损坏 4 条）+ tavily 3/3（含 432 notice）；build + test:all 全绿。