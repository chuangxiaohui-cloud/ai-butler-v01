# 推进计划：航天状态权威源登记

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

为“中国空间站/航天员/在轨”类强时效问题登记官方权威源：中国载人航天工程办公室（cmse.gov.cn）、国家航天局（cnsa.gov.cn）以及新华社/人民日报等官方媒体。检索改写自动追加官方域子查询，融合层把官方域名标记为 `[hard]` 并提高权威度，进一步压缩“旧闻/野史抢答”空间。

## 计划

1. `authority.ts` 增加航天官方域名规则、`isSpaceStatusQuery` 与 `isOfficialForQuery` 航天判定。
2. `query-rewrite.ts` 对航天状态问题（news/factual）追加 `site:cmse.gov.cn`、`site:cnsa.gov.cn` 与“载人航天小喇叭”子查询。
3. 补 authority/rewrite 单测。
4. 跑 `npm run test:all` 与 doc-lint。
5. 真实复测“中国空间站现在有哪几个航天员在太空”，确认改写生效且旧闻防护不回归。
6. 登记 v2.5 附录 A（E85）、更新进度与计划文档，提交推送。

**验收标准**

- 航天状态问题的子查询包含官方域。
- `cmse.gov.cn` / `cnsa.gov.cn` 被识别为官方源。
- 单测全绿，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- `authority.ts`：新增 `isSpaceStatusQuery` 与 `SPACE_STATUS_DOMAINS`；域名权威表登记 `cmse.gov.cn`/`cnsa.gov.cn`（1.0）与 `people.com.cn`/`news.cn`（0.9）；`isOfficialForQuery` 对航天员/空间站/在轨类查询识别官方域名。
- `query-rewrite.ts`：航天状态问题（news/factual）自动追加 `site:cmse.gov.cn`、`site:cnsa.gov.cn` 与“载人航天小喇叭”子查询。
- 测试：authority 新增 2 条、rewrite 新增 2 条。

### 遇到的问题

- 腾讯新闻等旧闻虽已被时效红线挡住，但缺少官方源做正面证据；登记官网域名后，复测证据全部变为 `cmse.gov.cn` [hard]。
- 微信公众号“载人航天小喇叭”没有独立域名，只能作为子查询词，无法标 [hard]。

## 结果

- 验证：复测“中国空间站现在有哪几个航天员在太空”，证据为 `www.cmse.gov.cn`（[hard]）3 条，回答仍诚实为“截至今天暂无可靠更新”。
- 测试：单测 254/254 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：`9114bfd` · 推送：Gitee ✅ / GitHub 待补推（连接被重置）
- 遗留事项：暂无在轨乘组官方公告时仍只能诚实回答；后续可对官网“飞行任务”栏目做定时监控。
