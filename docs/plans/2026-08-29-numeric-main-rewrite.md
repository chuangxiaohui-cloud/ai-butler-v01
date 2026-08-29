# 计划：数值 predicate 主检索确定性增强（E279）

> 日期：2026-08-29 ・ 对应 E279 ・ 用户批准方案（含三处修订 A/B/C）

## 背景

用户判据表：① 合成通（gate=none）✅ ② 答案缺具体延迟数值 ❌ ③ predicate=numeric ✅。轨迹实证（`data/trajectory.jsonl`）：同 query 三次运行主检索 query 分别为「延迟最低的数据库 性能对比 / 低延迟数据库排名 / 裸 query」——分类器 LLM 每次改写不同。带「性能对比」时证据出现 22ms/6ms 对比文；裸 query 时全为泛文。结论：病根是数值 predicate 主检索缺少确定性数据/对比触发子查询；P-137 补检索是「证据完全无数字」安全网，本轮证据有数字不触发，改它救不了主检索。

## 计划（用户批准，含三处修订）

1. `query-rewrite.ts` numeric 分支：`classifyPredicate === 'numeric'` → 确定性追加 `${query}${[P-137] 后缀}` 子查询（E85/E270 同款规则子查询模式）→ 验证：rewrite 单测
2. `search-loop.ts` judge 数值感知（修订 A 硬上限）：仅增强子查询仍在队列且未超 [P-139] 上限时延迟判够；无 LLM 强制判不够保证至少跑一轮；超限接受当前证据，永不无限循环 → 验证：search-loop 单测
3. `numeric-pattern.ts` 单位表补 p50/p99/p999/TPS/QPS/IOPS 六项（修订 C 零领域词硬约束：后缀只用中性「数据 参数 对比」，不用 benchmark/p99/ms）→ 验证：numeric-pattern 单测
4. 用例修订 B：用例 2 改措辞为「Redis 和 Memcached 哪个读取延迟更低」（含 哪个…更低 → numeric 链路）；用例 1/2/3 为 e2e（答案含数值）待真实 CLI 复测，用例 4/5（市值/GDP）单测回归
5. 文档：§5 新增 P-139 + P-137 行更新（兼主检索增强后缀）、§6.5.6 E279 段落、附录 A E279；本计划 + handoff

## 执行

- `query-rewrite.ts`：新增 numeric 分支（排在 news/space/finance/version/phone/datasheet 分支之后、默认 return 之前），返回 `[\`${query} 数据 参数 对比\`, ...techQueries, query]`；import `classifyPredicate`（`answer-readiness.js`）与 `PARAMS`（`config/params.js`）。
- `search-loop.ts`：`buildCoverageJudgeMessages` / `judgeCoverage` 增 `requireNumeric` 参数（prompt 注入「缺少带量纲具体数值时判 enough=false 并给出数据/对比子查询」；无 LLM 时强制 enough=false）；`runSearchLoop` 计算 `hasNumericEnhancement`（numeric 且 maxSubSearches>1 且改写结果含增强子查询），循环内 `numericPending = 增强子查询仍在队列 && numericExtraRounds < [P-139]` 才传 requireNumeric，消费后计一轮。
- `numeric-pattern.ts`：单位表追加 延迟百分位（p50/p99/p999）与 吞吐（TPS/QPS/IOPS）六项。
- `params.ts`：新增 P-139 `numericJudgeExtraSearchCap: 2` + PARAM_IDS。
- 单测 10 处：query-rewrite 6（数值增强/无 LLM 入队/LLM 强制入队/GDP 回归/金融器件新闻优先分支不吃后缀/非数值不加）、search-loop 3（无 LLM 强制消费增强子查询/数值感知 judge 消息/轮数受 [P-139] 与 maxSubSearches 双约束）、numeric-pattern 1（吞吐百分位识别）。

## 结果

- 目标 3 文件单测 50/50 绿；全量单测 1084/1085（1 skip）+ 集成 32/32 全绿；`npm run build` 绿；doc-lint 0 FAIL 0 WARN（C8 62 key）。
- 登记：附录 A E279；§5 新增 [P-139]（provisional@2026-08-29）+ [P-137] 行更新；§6.5.6 信号 B 增 E279 段落。
- e2e 待用户复测（成本纪律不代跑）：① 延迟最低的数据库有哪些 → 答案含 ms 级数值；② Redis 和 Memcached 哪个读取延迟更低 → 含双方数值+单位；③ PostgreSQL 16 写入性能 benchmark → 含 TPS/IOPS 数值。

## 残余

- 分类器 LLM 仍可能把 query 改写成带「排名」的变体（如「低延迟数据库排名」），会误入金融分支（E270 词表含 排名）——预存问题，本轮未动，若复现可收紧金融词表。
