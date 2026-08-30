# 推进计划：收邮件（IMAP 只读收件箱，E293）

> 日期：2026-08-31 · 分支：v0.2b（提交归属待 owner 拍板）· 状态：执行中

## 目标

按 owner 指令（2026-08-31）：「既然邮件发送做了，收邮件也一起实现」。最小只读收件：查收件箱最近 N 封（发件人/主题/时间/未读标记）+ 读指定封全文；内容按 §10.5 注入防护标记为 untrusted_data。不做：搜信/文件夹/附件下载/MIME 解码/多账号（v2.6 候选）。

## 计划

1. `src/mail/imap.ts`（新）：最小 IMAP 客户端（node:net/node:tls）——LOGIN / SELECT INBOX / SEARCH ALL / FETCH 头部+FLAGS / FETCH BODY.PEEK[TEXT] / LOGOUT，支持 `{n}` 字面量解析；`deriveImapHost`（smtp.xxx → imap.xxx）
2. `src/mail/credentials.ts`：`SmtpCredentials` 增可选 `imapHost/imapPort/imapSecure`（缺省推导），load/save 透传
3. `src/skills/office-daily/index.ts` email 模式新增收件分支（收件箱/查邮件/收邮件/未读邮件/读第 N 封），无凭据/连接失败诚实提示，正文包裹 untrusted_data 防护分隔符；`modeFrom` email 正则补收件关键词
4. `src/agent/intent-feature.ts`：office_daily 特征正则补收件关键词
5. 测试：`src/mail/imap.test.ts`（fake IMAP 服务器）+ office-daily 收件用例（fake IMAP）+ router-v2 收件路由用例
6. 文档：计划 + 附录 A E293 + roadmap（收件作为 v2.6 增量登记）+ handoff

**验收标准**

- `fetchRecentEmails` 返回最近 N 封含未读标记；`fetchEmailText` 返回正文
- office-daily：`npm run dev -- "查收件箱"` 列表、`"读第 1 封"` 全文；无凭据/空收件箱/失败诚实提示；正文带 untrusted_data 防护标记
- `npm run build` 绿；imap + office-daily + router-v2 相关单测全绿；doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

1. `src/mail/imap.ts`（新）：最小只读 IMAP 客户端——`resolveImapConfig`（smtp.xxx→imap.xxx 推导，默认 993 TLS，可覆盖）、`fetchRecentEmails`（LOGIN→SELECT INBOX→SEARCH ALL→FETCH 头部+FLAGS，最新 N 封倒序）、`fetchEmailText`（BODY.PEEK[TEXT]<0.N> 部分抓取，不置已读）、`extractPlainText`（text/plain 直返 / multipart 取首个部件）；Buffer 字节级解析 `{n}` 字面量；明文仅 STARTTLS 升级后 LOGIN（H4）。
2. `src/mail/credentials.ts`：`SmtpCredentials` 增可选 `imapHost/imapPort/imapSecure`，load/save 透传，缺省推导。
3. `src/skills/office-daily/index.ts`：email 模式新增收件分支（收件箱/收邮件/查邮件/未读邮件/读第 N 封）；无凭据/空收件箱/失败诚实提示；正文按 §10.5 untrusted_data 分隔符包裹；`modeFrom` 补收件关键词；`createOfficeDailySkill` 增 `imapOptions` 测试注入。
4. `src/agent/intent-feature.ts`：office_daily 特征正则补收件关键词（router-v2 直连回本 skill）。

### 遇到的问题

- IMAP 字面量按字节计数：初版用字符串缓冲，中文正文/主题会错位——改为 Buffer 字节级解析。
- fake IMAP 服务器判 `BODY[HEADER` 漏了 `BODY.PEEK[HEADER` 中的点号，导致假服务器不返回头部——修正为 `/HEADER\.FIELDS/`。

## 结果

- 验证：`npm run build` 绿；`npm run test:all` 退出码 0（集成 32/32）；doc-lint 0 FAIL 0 WARN；imap 8/8、office-daily 161/162（1 skip）、router-v2+credentials+smtp 97/97。
- 测试：单测新增 14 条（imap 8 + office-daily 收件 4 + router-v2 2）；相关文件全绿。
- 提交：待 owner 拍板（v0.2b 封版决定 vs v2.6 pre-ship）· 推送：Gitee / GitHub
- 遗留事项：MIME 解码/附件/搜信/多账号已登记 `docs/roadmap.md`（E293-后，v2.6+ 候选）；真实 QQ/Gmail IMAP 冒烟待用户
