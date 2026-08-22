# 推进计划：Bocha 余额预警（§D.3 资源包健康检查落地）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

实现 §D.3「资源包健康检查（启动时 + 运行时）」的代码侧落地：Bocha 余额/次数可探测、可告警，
解决 owner「忘记 Bocha 没钱了，又不知道」的静默耗尽问题。

## 计划

1. 新增 `src/search/balance.ts`：余额探测（GET `/v1/fund/remaining`，主备双 host，3s 超时静默失败）、
   内存 + `data/bocha-balance.json` 持久缓存（30 分钟冷却）、[P-75] 折算剩余次数、
   [P-67] 余量告警/耗尽强告警文案。
2. `SearchProviderResult` 增加可选 `notice`；`bocha.ts` 在 HTTP 4xx（401/402/403/429）时探测余额并透出告警。
3. `s3_search.ts` / `search-loop.ts` / `pipeline.ts` 逐层聚合 `notices`，`AnswerResult` 增加可选 `notice` 字段（契约超集）。
4. `main.ts` CLI 启动探测（持久缓存兜底，不拖慢热查询）；gateway 启动探测 + 新增只读 `GET /api/bocha/balance`。
5. 补单测（mock fetch：解析/失败/冷却/持久缓存/告警文案、provider 4xx notice、stage notices 聚合）。
6. 真跑验证：余额探测 1 次（bench:B-20260822-04 证据）+ search:smoke 回归；doc-lint + build + test:all。
7. 登记附录 A E192、更新 handoff 与 code-directory。

**验收标准**

- `npm exec tsx scripts/doc-lint.ts`：0 FAIL 0 WARN（附录 947→948/950）。
- `npm run build` + `npm run test:all`：单测/集成全绿（新增 balance/bocha 单测）。
- 真跑 `queryBochaBalance()`：返回余额 ¥2.80、约 777 次（与充值实况一致）。
- 余额耗尽/低余量时 CLI stderr、gateway 日志、answer JSON `notice` 三处可见告警。
- `npm run search:smoke`：双引擎 10/10 不回归。

## 执行过程

### 改动

- 新增 `src/search/balance.ts`：`queryBochaBalance()` 主备双 host 探测（api.bocha.cn / api.bochaai.com，3s 超时静默失败）、
  内存 + `data/bocha-balance.json` 持久缓存（30 分钟冷却）、[P-75] 折算剩余次数、
  `bochaBalanceWarning()` 耗尽强告警 / [P-67] 低余量（剩余次数 ≤ 10）软告警。
- `SearchProviderResult` 增加可选 `notice`；`bocha.ts` HTTP 4xx（401/402/403/429）时探测余额并透出告警，
  latencyMs 保持 HTTP 请求耗时不被探测污染。
- `s3_search.ts` / `search-loop.ts` / `pipeline.ts` 逐层聚合 `notices`，`AnswerResult` 增加可选 `notice`（契约超集，健康时不出字段）。
- `main.ts` CLI 启动探测（持久缓存兜底，健康不打扰）；`gateway/server.ts` 启动探测打日志；新增 `GET /api/bocha/balance` 只读端点。
- 新增 `scripts/balance-smoke.ts` + `npm run balance:smoke` 随时查看余额/次数。
- 登记附录 A E192 + `bench/B-20260822-04-bocha-balance.md` 证据；更新 `docs/code-directory.md`。

### 遇到的问题

- `apply_patch` 在本环境被拒（WindowsApps 权限），改用 PowerShell + node 脚本做精准文本替换。
- PowerShell 双引号内嵌反引号模板串被转义破坏（CLI 告警文案），改用 .cjs 脚本文件修复。
- 修复两处手误：pipeline.ts 接口丢失收尾 `}`、main.ts 闭括号缺失；gateway 测试 import 未写回磁盘。
- [P-67] 10% 阈值无资源包总量接口可算占比，落地为固定告警线「剩余次数 ≤ 10」（E192 登记语义）。

## 结果

- 验证：`npm run balance:smoke` 真跑 303ms 返回 ¥2.80 / 777 次，健康无告警；`search:smoke` 10/10 双引擎无回归；CLI 端到端答案正常（健康时不带 notice）。
- 测试：单测 554/555（+1 fitz 门控跳过，新增 balance 8 + bocha 4 + s3 notices 1 + gateway 端点 1）、集成 17/17；`npm run build` 全绿；doc-lint 0 FAIL 0 WARN（附录 949/950）。
- 提交：待 owner 签认后提交（E192）。
- 遗留事项：UI 原型已接（资源包面板 + 聊天区预警横幅，生产构建通过）；Tavily 月配额余量探测（§D.3 另一半）未落地。
