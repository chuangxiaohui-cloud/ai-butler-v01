# 推进计划：Tavily 触发冒烟 + 配额监控（E195）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成（E195）

## 目标

Tavily 已接入并启用（§6.2.1 条件并联 + E72 官方域兜底），但 `search:smoke` 只覆盖 Bocha + AnySearch，
Tavily 触发路径与月度配额 [P-64]=1000 无可见性。本轮补：
1. `npm run tavily:smoke`：key 配置检查 + `shouldTriggerTavily` 触发判定 + 1 次真实链路冒烟
   （`runSearchStage` 注入 Tavily，走真实配额 + provider）+ 月度配额报告（已用/剩余，剩余 <20% 预警）。
2. `src/search/quota.ts` 新增只读 `readMonthlyQuota` 快照 + `TAVILY_MONTHLY_LIMIT` 常量单源化
   （当前 `s3_search.ts`/`search-loop.ts` 各自硬编码 1000，改为统一导入）。
3. 计划 → bench:B-20260822-07 → 附录 A 登记 E195 → 交接更新。

**验收标准**

- `npm run tavily:smoke` 一键输出：key 状态 / 触发判定样例 / 真实调用（ok + 结果数 + AI answer + 延迟）/
  配额（已用/上限/剩余/预警），非零退出码当 key 缺失或真实调用失败。
- `readMonthlyQuota` 单测覆盖：文件缺失 / 当月计数 / 跨月归零 / 损坏文件。
- build + test:all 全绿；doc-lint 0 FAIL 0 WARN（附录 950/950，先压缩旧条目腾行）。

## 执行过程

### 改动

- `src/search/quota.ts`：新增 `TAVILY_MONTHLY_LIMIT`、`MonthlyQuotaSnapshot`、`readMonthlyQuota()`。
- `src/search/stages/s3_search.ts`、`src/search/search-loop.ts`：本地 `TAVILY_MONTHLY_LIMIT` 改从 `quota.js` 导入（删重复常量）。
- `scripts/tavily-smoke.ts`：新增冒烟脚本。
- `package.json`：新增 `tavily:smoke` 脚本。
- `src/search/quota.test.ts`：补 `readMonthlyQuota` 单测。

### 遇到的问题

- **HTTP 432 实锤配额超限**：真实冒烟调用返回 432，探测响应体为
  `This request exceeds your plan's set usage limit`——Tavily key 有效但本月计划额度已耗尽，
  本地计数 634/1000 与远端矛盾（实际额度 <1000 或 news/advanced 多倍计费）。据此把 432 显式
  映射（error + notice，复用 E192 模式）并在冒烟中单独识别，配额报告如实标注口径不一致。

## 结果

- 验证：`npm run tavily:smoke` 输出 key/触发判定/真实链路/配额报告；真实链路 HTTP 432（配额超限）
  被显式识别；触发判定 6 例（english×3、news×1、low_confidence_hint×1、严肃禁区 none×1）全部正确。
  证据：`bench/B-20260822-07-tavily-smoke.md`。
- 测试：quota 单测 6/6（readMonthlyQuota 4 条新增）+ tavily 3/3（432 notice 新增）；
  `npm run build` ✓、`npm run test:all` 全绿（集成 17/17）、`doc-lint` 0 FAIL 0 WARN（附录 947/950，
  压缩 E56 腾行）。
- 提交：（待提交）
- 遗留事项：**Tavily 处于配额超限（432）**；owner 已决策等下月重置（已核实用量耗尽），
  9 月重置后跑 `npm run tavily:smoke` 复核，并评估 [P-64] 口径复算（本地计数 vs 远端 credits）。