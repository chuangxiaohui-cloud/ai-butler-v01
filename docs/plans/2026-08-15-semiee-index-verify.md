# 推进计划：半导小芯搜索命中与站内兜底

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

验证 E92 把 `semiee.com` 纳入国内资料站后，真实搜索引擎能否命中半导小芯；若命中率低，则补一条“用户点名半导小芯时用浏览器直达站内搜索”的兜底链路。

## 计划

1. 创建本计划文档。
2. 跑真实 Agent 查询 `STM32F103C8T6 半导小芯 数据手册`，检查 evidence 是否出现 `semiee.com`。
3. 若未命中，探测半导小芯站内搜索 URL，并新增浏览器直达兜底。
4. 补单测，跑 build/test/doc-lint。
5. 更新本计划、当日交接、v2.5 附录 A（E94），提交推送。

**验收标准**

- 能给出“搜索引擎是否命中 semiee.com”的明确结论。
- 若命中率低，浏览器直达兜底能把半导小芯站内结果带进 evidence。

## 执行过程

- 真实查询 `STM32F103C8T6 半导小芯 数据手册`：evidence 只有 ST 官方，无 semiee.com。
- 探测半导小芯站内搜索：搜索参数是 `searchModel`（不是 `q/keyword`），`https://www.semiee.com/search?searchModel=STM32F103C8T6` 返回“你要查询的可能是 STM32F103C8”的结果页。
- `search-loop` 新增：用户原始问题点名半导小芯且结果无 semiee 时，用浏览器会话直达站内搜索补证据。
- 融合层新增：点名国内资料站时至少保留一条该站证据，不再被 top3/0.4 阈值截断。
- 修复：LLM 查询改写会把“半导小芯”从搜索词里丢掉，`search-loop` 增加 `originalQuery` 用原始问题判断站点点名。

## 结果

- 复测 `STM32F103C8T6 半导小芯 数据手册`：evidence 含 `www.semiee.com/search?searchModel=STM32F103C8T6`（score 0.356，[soft]），回答也给出半导小芯入口。
- 新增 search-loop 1 条 + fusion 1 条单测；`npm run build` 通过，`npm run test:all` 257/257 + 17/17 全绿，doc-lint 0 FAIL / 0 WARN。
