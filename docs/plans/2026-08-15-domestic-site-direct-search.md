# 推进计划：立创/芯查查站内直达兜底

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

把 E94 的“点名半导小芯 → 浏览器直达站内搜索”推广到立创商城与芯查查：用户原始问题点名这些站且搜索结果没有对应域名时，用 QQ 会话直达站内搜索补证据。

## 计划

1. 创建本计划文档。
2. 探测立创商城与芯查查的站内搜索 URL。
3. 在 `search-loop` 用站点→搜索 URL 映射替代单站硬编码，触发条件按“点名站点”判断。
4. 补单测，跑 build/test/doc-lint。
5. 真实查询验证 evidence 含 szlcsc/xcc。
6. 更新本计划、当日交接、v2.5 附录 A（E95），提交推送。

**验收标准**

- 立创与芯查查的站内搜索 URL 可访问且返回型号相关内容。
- 点名任一国内站时，evidence 至少保留一条该站证据。

## 执行过程

- 立创商城搜索 URL：`https://so.szlcsc.com/global.html?k=<型号>`（`www.szlcsc.com/so/global.html` 会跳转过来）。
- 芯查查搜索 URL：`https://www.xcc.com/chip/material/search?title=<型号>`（模拟首页搜索框回车得到，`?keyword` 等旧候选全部 404）。
- `authority.ts` 新增 `DOMESTIC_DATASHEET_SITES` 站点→站内搜索映射（立创/芯查查/半导小芯）；`search-loop` 用映射循环替代 E94 的单站硬编码。
- 新增 search-loop 单测 2 条（立创、芯查查站内直达）。

## 结果

- 真实查询 `STM32F103C8T6 芯查查 数据手册`：evidence 含 `www.xcc.com/chip/material/search?title=STM32F103C8T6`（[soft]）。
- 真实查询 `STM32F103C8T6 立创商城 数据手册`：evidence 含 `so.szlcsc.com/global.html?k=STM32F103C8T6`（[soft]）。
- 半导小芯 E94 链路保持可用。
- 注意：两条 `npm run dev` 并发会抢 SQLite 写锁，CLI 应串行执行。
- 回归：`npm run build` 通过，`npm run test:all` 259/259 + 17/17 全绿，doc-lint 0 FAIL / 0 WARN。
