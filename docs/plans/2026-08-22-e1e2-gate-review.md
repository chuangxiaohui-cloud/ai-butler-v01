# 推进计划：E1/E2 复验门复核——口径修正与定稿评估更新（E187）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成（[P-04]/[P-02]/[P-03]/[P-12] 均已定稿）

## 目标

承接 E9（2026-08-13 完成 P-04/P-02 定稿评估，维持 provisional 等 owner 签认）。本期复核复验门当前证据，
并修正 gate 工具口径：`recheck-gates`/`finalize-gates` 当前把“!ok 率”标成“超时率”，与文档 §6.7
复验门（5s 超时率）定义不符，且未覆盖对冲③“双返回率低于七成触发 [P-02] 重新决策”。

## 计划

1. 只读数据分析：
   - E1：`bench/classify-metrics.jsonl` n=70，timeout 0.0%、准确率 80.0%、p95=1406ms → 推荐
     `[P-04]`=1750ms（≤2000ms）→ 复验门 PASS。
   - E2：`bench/search-metrics.jsonl` 全库无 Bocha 真实 5s 超时（max=1055ms）；保守口径真实超时占比
     Bocha≈2.4%、AnySearch≈5.0%（均低于阈值）；但 Bocha !ok 率≈28%（快速 HTTP 错误，疑似配额/余额，
     非超时）、双返回率≈34%（<70%，触发对冲③）。
2. `scripts/recheck-gates.ts` + `scripts/finalize-gates.ts`：输出拆分为 failRate（可用率口径）、
   timeout5sRate（真实 5s 超时保守占比）、双返回率；E2 判断区分“复验门（超时率）”与“对冲③（双返回率）”。
3. 文档：附录 A 登记 E187；§5 注册表维持 provisional（遵循 E9 先例，晋升待 owner 签认）；handoff 更新；
   doc-lint 全绿。
4. 遗留：Bocha 当前可用性需联网探活（本机 approval 基础设施故障，Agent 无法联网），待用户跑
   `npm run search:smoke` 确认；owner 签认后执行 [P-04]→1750ms 晋升与 `LLM_CLASSIFY_TIMEOUT_MS` 默认值同步。

## 执行过程

### 改动

- `scripts/recheck-gates.ts`：`engineStats` 增加 `timeout5s` 计数（timeout=true 且该引擎 !ok 的保守归因）；
  新增双返回率统计（非缓存请求中两引擎均 ok 占比）；输出拆分 failRate/timeout5sRate；判断区分为
  “复验门（超时率）未触发”与“对冲③（双返回率 <70%）触发 [P-02] 重新决策”。
- `scripts/finalize-gates.ts`：同步口径拆分；E2 结论分别输出复验门与对冲③；E1 逻辑不变
  （classify 的 timedOut 即真实超时标志，标签准确）。

### 遇到的问题

- **approval 基础设施故障**：`require_escalated` 被误拒（报错为模型路由配置错误，非安全拒绝），
  无法联网执行 `search:smoke`/`classify:smoke` 补采冷调用样本；本轮基于既有 1523 条 search 指标 +
  70 条 classify 指标做只读评估，联网探活留给用户手动执行。
- **“超时率”口径误导**：全库 Bocha max=1055ms，说明 28.1% 的“超时率”实为快速 HTTP 错误（配额/余额类），
  与文档定义的 5s 超时率完全不是一回事；不修口径，后续任何 E2 复核都会被误导。

## 结果

- 验证：`npm run recheck:gates` / `npm run finalize:gates` 输出新口径（failRate/timeout5sRate/双返回率）；
  `npm run build` + `npm run test:all` 全绿；`doc-lint` 0 FAIL 0 WARN。
- E1：复验门 PASS，推荐 [P-04]=1750ms；owner 已签认（A 方案按 1750ms 晋升），执行晋升并同步
  `LLM_CLASSIFY_TIMEOUT_MS` 默认值（`src/search/llm-registry.ts` light 档 2000→1750、
  `scripts/classify-smoke.ts` 默认显示 1750、`scripts/finalize-gates.ts` E1 上限 2000→1750）；
  §5 注册表 [P-04] 转 定稿，附录 A 登记 E188（bench:B-20260822-01）；晋升验证：1750ms 下
  `classify:smoke` 10 条 0/10 超时、准确率 8/10、max=1026ms（叠加 n=70：p95=1406ms /
  max=1542ms，缓冲充足）；doc-lint 0 FAIL 0 WARN + build + 单测/集成全绿。
- [P-02] 定稿（E189）：充值后健康窗口（2026-08-22T09:02Z 起，连续 60 条搜索指标，
  bench:B-20260822-02）Bocha/AnySearch 超时率均 0.0%、双返回率 50/60=83.3%（≥70%），
  E2 复验门 PASS + 对冲③ NOT triggered；owner 签认后 §5 注册表 [P-02] 转 定稿，
  附录 A 登记 E189；[P-02]=5s 保持成立，无代码值变更。
- [P-03] 定稿（E190）：与 [P-02] 共用 E2 复验门证据（AnySearch@5s 超时率全窗口 7.7%、
  健康窗口 0.0%），约束 P-03<=P-02 保持；[P-03]=5s 转 定稿，无代码值变更。
- [P-12] 定稿（E191）：附录 C v0.2a 全量验收证据（`bench/v02a-report.md` 30/31 ≥2、
  0 硬答，96.8% ≥80%）；[P-12] 80% 阈值转 定稿，无代码值变更。
- E2：复验门（超时率）未触发（Bocha≈2.4%、AnySearch≈5.0%），但对冲③ 双返回率≈34% <70% 触发
  [P-02] 重新决策；根因 Bocha 快速 HTTP 错误（疑似配额/余额）。
- 探活（2026-08-22 `npm run search:smoke`，用户手动执行）：Bocha 10/10 快速失败（failRate 100%、
  timeout5sRate 0%、58-285ms HTTP 错误）、AnySearch 10/10 ok、双返回率 0%——Bocha 可用性故障
  坐实，[P-02] 重开决策成立。
- 恢复复核（同日充值后）：Bocha 10/10 ok（126-336ms）、AnySearch 10/10 ok、双返回率 100%、
  failRate 0%——可用性恢复；[P-02] 触发条件解除，维持 provisional 推进定稿评估。
- 提交：核心 `0a0d5df` + 探活登记 `dffa89c` 已提交；恢复复核登记待 housekeeping 提交。
- 遗留事项：双返回率数据的 smoke/bench/test 来源拆分待后续加 source 标记；引擎级人工分校准
  [P-16]/[P-17]（阈值 0.6：正例保留 67/75、负例拦截 5-6/18）与 [P-63]（Bocha 日配额政策）
  待 owner 决策后定稿；[P-01]/[P-06]/[P-13]/[P-15]/[P-80]-[P-94]/[P-105]-[P-107] 按各自复验门推进。
