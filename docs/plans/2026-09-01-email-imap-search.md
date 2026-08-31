# 推进计划：收邮件搜信（IMAP SEARCH 条件 + 中文解码本地兜底）

> 日期：2026-09-01 · 分支：v0.2b · 状态：完成（E300）
> 关联：`docs/roadmap.md` E293-后（搜信 / 多账号）/ owner 指令 2026-09-01「继续推进」（按建议先做搜信）

## 目标

「查收件箱」之外的检索能力：按**主题 / 发件人 / 通用关键词**搜收件箱，结果与查收件箱同格式（Date 倒序 + 📎 附件标记）。IMAP `SEARCH SUBJECT/FROM` 走服务器端；中文 MIME 编码主题（`=?utf-8?B?...?=`）服务器 SEARCH 不命中，本地解码后对最近窗口兜底过滤。

## 计划

1. `src/mail/imap.ts`：新增 `ImapSearchCriteria { subject?, from?, keyword? }` 与 `searchEmails(creds, criteria, options)`——`SEARCH <条件>`（SUBJECT/FROM/`OR (SUBJECT|FROM)`，多条件 AND）+ 非 ASCII 或服务器零命中时取最近 `searchWindow`（默认 200）封本地解码过滤；结果复用查收件箱的排序/截断/📎（抽出 `fetchHeaderSummaries` / `fetchAttachmentFlags` / `sortAndSlice` 私有助手，`fetchRecentEmails` 同步复用）。
2. `src/skills/office-daily/index.ts`：email 模式新增搜信分支（`搜信|搜.*邮件|找.*邮件|查找.*邮件|搜索.*邮件`，置于附件分支后、收件分支前）；`extractSearchCriteria` 提取主题/发件人/关键词（「主题是 X」「X 发的邮件」「来自 X」「搜 X」）；列表与查收件箱共用 `formatEmailList`（含 📎）；无关键词/无凭据/无结果诚实提示。
3. `src/agent/intent-feature.ts`：office_daily 特征正则补搜信关键词 → 搜信直连 office-daily。
4. 测试：imap TLS 集成（SEARCH 命令断言 + 主题/发件人/关键词过滤 + 📎）、office-daily（搜周报命中 / 搜 alice 发件人 / 无结果 / 无关键词提示）、router-v2（搜周报邮件 → office-daily）。
5. 文档：附录 A E300、roadmap E293-后、当日 handoff。

**验收标准**

- `npm run build` 绿；imap / office-daily / router-v2 相关单测全绿。
- 中文主题可搜（本地解码兜底）；发件人可用邮箱名/显示名搜；结果带 📎。
- doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- 见「计划」。

### 遇到的问题

- `matchCriteria` 首版用 `has()` 窄化条件字段，TS 不识别窄化报 `possibly undefined`，改为直接 `if (c.subject)` 判空窄化。
- 写需求文档附录 A 时，PowerShell 双引号内 `` `n ``/`` `x `` 会被当作转义（`` `npm `` 变成换行、`` `src `` 丢反引号），E300 条目一度被拆成 3 行且反引号丢失；已重建为单行、逐项恢复反引号（E299 冒烟句同批次反斜杠残留一并修复）。
- 真实冒烟（owner 2026-09-01）发现「搜周报的邮件」被市场 Skill docx-write 触发词「周报」（2 字）抢占生成无关 docx：市场触发词直连（E243）无条件优先于路由。修复 E301——`src/search/pipeline.ts` 路由 decision 为 direct（已直连本地 Skill）时 `minTriggerLength` 提到 3，2 字泛触发词不抢专属意图；≥3 字定向触发词照常覆盖。

## 结果

- 验证：`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 测试：新增单测 7 条——imap TLS 集成 2（主题 SEARCH 命令 + 中文本地兜底过滤 / 发件人、通用关键词 + 📎 标记）、office-daily 4（搜周报命中同格式 / 找 alice 发件人 / 无结果 / 无关键词引导）、router-v2 1（搜周报邮件 → office-daily）；imap+router-v2 109/109、office-daily 74/75（1 skip 为既有 PDF 用例）。
- 冒烟修复（E301）：新增 pipeline 单测 2 条（直连本地 Skill 时 2 字触发词不抢 / 未直连时照常命中）；pipeline+nl-router 64/64。
- 提交：随当天收尾提交（commit 见 git log）。
- 遗留：真实 QQ 搜信冒烟部分通过（发件人搜索命中 2 封 + 📎），主题搜索 E301 修复后复验待用户；多账号仍为 v2.6+ 候选。
