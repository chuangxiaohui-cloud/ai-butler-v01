# 推进计划：架构审计中期批·第三批（P6 + P8）

> 日期：2026-08-23 · 分支：v0.2b · 状态：已完成

## 目标

中期批热路径继续：P6（fusion/authority 循环不变量 per-item 重算：query tokenize/Set 去重
每条结果重跑、`${title} ${content}` 拼接 toLowerCase 在 5 个函数里重复、isOfficialForQuery
每条每规则 new RegExp）+ P8（CLI 每次运行先串行 await Bocha 余额探测，零网络斜杠命令
白加 RTT+超时）。

## 计划

1. P6 `src/search/authority.ts`：SOFTWARE_OFFICIAL_RULES 的 name 正则模块级预编译
   （每条规则一条 `\b(name1|name2)\b`）；新增 `buildOfficialQueryContext(query)` 把
   q 小写 / techDomains / spaceStatus / part / vendor 一次算好；新增
   `isOfficialForQueryCtx(url, ctx)` 与 `isHighTrustDatasheetUrlCtx`；
   `isOfficialForQuery` / `isHighTrustDatasheetUrl` 保持公开签名转调 ctx 版。
2. P6 `src/search/fusion.ts`：`buildRelevanceTokens(query)` 每条结果只算一次；per-item
   预计算 `ItemText{text, lower, titleLower}` 供 relevance/answerCoverage/FAQ/
   errorTopic/SEO 复用；ANSWER_SIGNALS 模块级预编译小写；fuse 循环内 query 派生值
   （relevance token、officialCtx、queryLower）一次算好传入。
3. P8 `src/main.ts`：`parseSlashCommand(arg)` 命中（/context、/compact）时跳过
   `warnBochaBalance()` 余额探测，直接进入斜杠处理。
4. 测试：authority 新增 ctx 派生值 / ctx 等价 / 大写 query 3 条；fusion 新增大写 query
   官方识别 1 条。
5. 文档：附录 A E210 登记（affects §6，bench:na(new-param)）；本计划补结果；交接登记。

**验收标准**

- 行为不变：authority/fusion 全部既有单测通过；fuseResults 对既有 20+ 用例输出不变。
- `isOfficialForQueryCtx` 与 `isOfficialForQuery` 对同一 (url, query) 结果一致。
- `/context`、`/compact` 不再触发 Bocha 余额网络探测。
- build + 全量单测 + 集成 + doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

P6 `src/search/authority.ts`：
- `SOFTWARE_OFFICIAL_RULES` 改模块级预编译：新增 `escapeRegExp` + `nameRe`（每条规则一条
  `\b(name1|name2)\b`），消掉 `isOfficialForQuery` 每条结果每规则 `new RegExp`。
- 新增 `OfficialQueryContext` + `buildOfficialQueryContext(query)`：q 小写 / techDomains /
  spaceStatus / part / vendor 一次算好；新增 `isOfficialForQueryCtx(url, ctx)` 与
  `isHighTrustDatasheetUrlCtx`；原公开函数 `isOfficialForQuery` / `isHighTrustDatasheetUrl`
  保持签名转调 ctx 版（rule1/search-loop/second-pass 等调用方零改动）。

P6 `src/search/fusion.ts`：
- `relevanceScore` 拆为 `buildRelevanceTokens(query)`（每条结果只算一次）+ per-item 仅做
  小写包含判断。
- 新增 `ItemText{text, lower, titleLower}` + `buildItemText`，relevance / answerCoverage /
  isFaqWithoutProcedure / isErrorTopicMismatch / isSeoNoise 全部复用同一份拼接与小写，
  不再每条结果重复 4-5 次 `\`${title} ${content}\`.toLowerCase()`。
- `ANSWER_SIGNALS` 模块级预编译 `ANSWER_SIGNALS_LOWER`，信号匹配不再逐条 toLowerCase。
- fuse 循环内 query 派生值（relevanceTokens / officialCtx / queryLower）一次算好传入；
  seoNoise 高可信判定复用已算出的 `official`（`official || isDomesticDatasheetUrl` 与原
  `isHighTrustDatasheetUrl` 语义一致）。

P8 `src/main.ts`：
- `parseSlashCommand(arg)` 命中（/context、/compact）时跳过 `warnBochaBalance()` 余额
  探测，直接进入斜杠处理（零网络命令白省一个 RTT+超时）。

新增/补充测试 4 条：
- `src/search/authority.test.ts`：buildOfficialQueryContext 派生值、isOfficialForQueryCtx
  与 isOfficialForQuery 等价、大写 query 仍识别官方源（3 条）。
- `src/search/fusion.test.ts`：P6 预计算后大写 query 官方源识别与乘数生效（1 条）。

### 遇到的问题

- authority.test.ts 新用例断言写错：`buildOfficialQueryContext('STM32 看门狗 PWM')` 的
  `part` 是 `'STM32'`（型号前缀本身命中 [A-Z]{2,}[0-9A-Z-]{2,}）而非 null，vendor 亦非
  null → 修正为：型号 query 断言 part/vendor 命中，另用无型号 query（Tauri/航天题）断言
  part/vendor 为 null。

## 结果

- 验证：`npm run build` 通过；相关单测（authority/fusion/rule1/query-rewrite/search-loop/
  second-pass/pipeline）110/110；全量单测 `npm run test:all` 634/635（1 skip，0 fail）+
  集成 15/15；CLI `/context` 冒烟 3.6s 返回（无余额探测）；`npm exec tsx scripts/doc-lint.ts`
  0 FAIL 0 WARN。
- 测试：新增单测 4 条（authority 3、fusion 1）。
- 文档：附录 A E210 已登记（affects §6，bench:na(new-param)）；附录 941/950 行数安全。
- 提交：109021b（E208-E214 中期批 1-7）
- 遗留事项：中期批剩余 P1/P2/P7-P17 + B2/B3 + S1-S3。
