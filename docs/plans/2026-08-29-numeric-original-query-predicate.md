# 计划：数值 predicate 原始查询判定 + 测量需求词帧（E280）

> 日期：2026-08-29 ・ 对应 E280 ・ 用户批准（三项归因全部接受；Fix 1 直接做；决策 A 走选项 1 附条件预批；决策 C 走选项 1 附两条硬约束）

## 背景

E279 落地后用户 e2e 复测三条全挂，但失败模式各不相同，三项归因（用户判定）：

- **Q1 延迟最低的数据库有哪些**：`synthesis_timeout`（58s）——检索已成功（3 条 evidence），合成 LLM 调用超时走兜底；这是挡路石，先排除。
- **Q2 Redis 和 Memcached 哪个读取延迟更低**：合成完成但全文无数值——B1 隐藏变体定位：s2 分类器把 query 改写成「读取延迟对比」（剥掉疑问词「哪个」），改写层 `ruleBasedRewrite` 用改写后串判 predicate 得 `other`，而输出层用 cleanQuery 判 `numeric`——**同一次运行两个 predicate 的数据流不一致**。且 Q1 evidence 由 E279 前泛文变为 IoTDB「性能领先」类命中页，增强子查询在执行，只是被合成超时盖住。
- **Q3 PostgreSQL 16 写入性能 benchmark**：`predicate: "other"` 实锤——含 benchmark 的 query 当时未被判 numeric（缺测量需求词帧），机制未启动。
- 单位表 +6 项因 A/B 未解本轮无法验证（不是错，是没机会被消费）。

## 计划（用户批准）

1. **Fix 1（直接做）**：`query-rewrite.ts` `ruleBasedRewrite`/`rewriteQuery` 增 `originalQuery?` 透传，numeric 分支 predicate 一律用原始 query 判定；`search-loop.ts` `hasNumericEnhancement` 同源改用 originalQuery → 验证：rewrite/search-loop 单测。
2. **决策 A（选项 1，附条件预批）**：不调 [P-116]/[P-06] 合成预算；Q1 超时按偶发抖动处理——复测若再次连续超时才重新评估预算。
3. **决策 C（选项 1，附两条硬约束）**：`answer-readiness.ts` 数字判定补「测量需求词」帧 `NUMERIC_DEMAND_RE`（benchmark/基准测试/跑分/压测/实测/性能测试/评测）；硬约束①词表不含 延迟/价格/评分 等量纲词（防「延迟满足」「价格与价值」误判）；硬约束②定义类帧 `DEFINITION_RE`（什么是/啥是/是什么/定义/概念）显式排除，「什么是基准测试」判 other → 验证：answer-readiness 反例单测。
4. **轨迹分层**：`pipeline.ts` + `trajectory-log.ts` 搜索轨迹补记 `subQueries` 字段，召回/融合故障可分层定位 → 验证：pipeline 单测。
5. **e2e 复测（用户预批）**：Q1/Q2/Q3 真实 CLI 各跑，按轨迹 subQueries 分层归因。

## 执行

- `query-rewrite.ts`：`ruleBasedRewrite(query, intent, originalQuery?)`，numeric 分支 `classifyPredicate(originalQuery ?? query)`；`rewriteQuery` 增第四参透传。
- `search-loop.ts`：`rewriteQuery(query, opts.intent, opts.llm, opts.originalQuery)`；`numericPredicateSource = opts.originalQuery || query`。
- `answer-readiness.ts`：`NUMERIC_DEMAND_RE`（测量需求词）+ `DEFINITION_RE`（定义类排除），numeric 判定顺序：疑问词 → 需求词（定义类除外）→ 时序 → 观点 → 操作 → other。
- `pipeline.ts`：search 轨迹事件补 `subQueries: search.subQueries`。
- `trajectory-log.ts`：`TrajectorySearch` 增可选 `subQueries?: string[]`。
- 单测 6 处：query-rewrite 3（originalQuery 透传 / 改写串判 other 回归 / 无 originalQuery 回退）、search-loop 1（增强判定用原始 query）、answer-readiness 2（benchmark 帧命中 + 定义类反例，覆盖两条硬约束）。

## 结果

- 目标 4 文件单测 66/66 绿；全量单测 1090/1091（1 skip）+ 集成 32/32 全绿；`npm run build` 绿。
- e2e 复测（用户预批，4 次真实 CLI）：
  - **Q1 通过**：gate=low_confidence、36s、非超时；答案含 DynamoDB 个位数毫秒级、S3 延迟降至 10%；轨迹 subQueries 证实增强子查询「低延迟 数据库 数据 参数 对比」已执行 → 决策 A 结论：上次 Q1 超时为偶发抖动，无需调 [P-116]/[P-06]。
  - **Q2 检索层生效、合成层被超时挡住**：subQueries 含「Redis vs Memcached 延迟性能对比 benchmark 数据 参数 对比」，召回 Anton Putra 基准文（平均延迟/P95/P99 毫秒级数值已进证据）；两次运行均 `synthesis_timeout`（38s/53s），第二次 fallback 摘要已含部分毫秒数值——数值已进证据，卡在 medium [P-116] 12s 合成预算。
  - **Q3 predicate 修复、检索仍缺数据**：predicate 由 other 修复为 numeric（synthesize readiness kind=numeric、gate=none、54s 合成完成），但检索仍无 PG16 TPS 实测（搜索引擎返回调优文；Tavily 月配额耗尽属环境折扣）；轨迹 5 条子查询含增强版。
- 登记：附录 A E280；§6.5.6 信号 B 增 E280 段落；本计划 + handoff。

## 残余

- Q2 合成已由 E281 闭环：`[P-116]/[P-06]` 12s→18s 后用户 e2e 复测 gate=none、64.7s，答案含双方毫秒级数值；MiniMax 兜底仍可能超 18s（非主链）。
- Q3 检索层缺 PG16 benchmark 数据页（Tavily 配额耗尽 + 引擎倾向返回调优文）；待配额恢复或换源复测。
