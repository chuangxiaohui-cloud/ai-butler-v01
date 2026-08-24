# 推进计划：Tavily [P-64] 口径复算评估（远端 usage vs 本地计数）

> 日期：2026-08-24 · 分支：v0.2b · 状态：已完成

## 目标

解决 E195 遗留矛盾：本地计数 634/1000 时远端已 HTTP 432 超限，复算 [P-64] 口径——
引入远端 `/usage` 权威用量快照，明确「本地计数（尝试次数）＝观察指标、远端＝超额判定依据」，
并登记口径结论与监控工具（不依赖 9 月重置）。

## 计划

1. 新增 `src/search/tavily-usage.ts`：`GET https://api.tavily.com/usage`（Bearer 认证、超时、失败静默）
   返回远端用量快照（usage/search/crawl/extract/map/research/plan/latency）。
2. 新增单测 `src/search/tavily-usage.test.ts`（injectable fetch：未配 key / 401 / 200 完整与部分字段 / 异常）。
3. 扩展 `scripts/tavily-smoke.ts` 第 4 段：远端 usage vs 本地计数对比报告，`limit:null` 不做
   `remaining = limit - usage`，超额判定以远端 `usage>=1000` 或 provider 432 为准。
4. 决策登记：本地计数语义补注为「尝试次数观察口径」；[P-64]=1000 数值不变，§5 备注与
   §6.2.1 配额段落补注口径；附录 A 登记 E228（bench:B-20260824-01）。
5. 更新 `docs/code-directory.md`、`docs/2026-08-24-progress-handoff.md`、计划文档结果段。

**验收标准**

- doc-lint 0 FAIL 0 WARN（附录 A 行数预算内）
- `npm run build` + `npm run test:all` 全绿（单测基数 783/784，1 skip）
- 真实调用 `fetchTavilyUsage()` 输出远端 usage=1000（Researcher plan，limit:null）
- 三段式提交（主体 → handoff → 计划补结果）

## 执行过程

### 改动

- 新增 `src/search/tavily-usage.ts`：`fetchTavilyUsage()` 拉取远端 `GET /usage`
  （Bearer 认证、3s 超时、失败静默、injectable fetch），返回 usage/search/crawl/extract/map/research/plan/latency。
- 新增单测 `src/search/tavily-usage.test.ts` 5 条（未配 key / 401 / 200 完整与部分字段 / fetch 异常）。
- `scripts/tavily-smoke.ts`：配额报告段升级为「远端 /usage 权威 vs 本地尝试次数计数」对比；
  `limit:null` 不做 `remaining=limit-usage`，远端不可达降级本地计数观察。
- 需求文档：§5 P-64 constraint 列补注「本地计数=尝试次数观察口径；权威以远端 /usage 与 HTTP 432 为准」、
  §6.2.1 配额段落补注、附录 A 登记 E228。
- `bench/B-20260824-01-tavily-usage.md` 证据文件、`docs/code-directory.md` 登记新模块。

### 遇到的问题

- PowerShell 对反引号/转义引号敏感，`apply_patch` 直写报语法错误；改用 Python 临时脚本
  精确锚点替换（`text.count(old)==1` 校验），UTF-8 无 BOM。
- 配额段落锚点谓词最初误中 §6.2.1 provider 表行（「免费月配额 [P-64]」在表格与段落各一处），
  改为精确匹配「> **配额**：」前缀后命中唯一。
- owner 未授权 `npm run tavily:smoke` 网络调用（本月额度已耗尽，真实搜索必 432，无增量信息）；
  真实复核留待 9 月重置，本会话以 `/usage` 探测（usage=1000/limit=null/plan=Researcher）与单测为证据。

## 结果

- 验证：doc-lint 0 FAIL 0 WARN（附录 524/950）；`npm run build` 通过；
  真实 `/usage` 探测（本会话）：usage=1000、limit=null、search_usage=1000、plan=Researcher（与 provider 432 印证）
- 测试：单测 788/789（1 skip）+ 集成 15/15（tavily-usage 新增 5 条）
- 提交：`f3b6b48`（E228 主体）+ `1e41f2c`（handoff 登记）
- 遗留事项：9 月重置后跑 `npm run tavily:smoke` 复核远端归零与本地计数重建；
  news/advanced 是否多倍计费待月度实证后按需再校 [P-64] 语义。
