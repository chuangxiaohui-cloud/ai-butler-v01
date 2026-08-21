# 推进计划：邮件 SMTP 发送（E170）

> 日期：2026-08-21 · 分支：v0.2b · 状态：已完成

## 目标

按 ADR-0002 阶段 1，让用户说“发送邮件给 xxx@example.com，主题…，正文…”时，
通过 SMTP + TLS 真实发信（显式用户动作，凭据本地存 `data/mail/mail-credentials.json`，
先草稿预览再确认发送，全程不静默发信）。

## 计划

1. `src/mail/` 适配层：`smtp.ts` 用 `node:net`/`node:tls` 实现最小 SMTP 客户端
   （EHLO / AUTH LOGIN / MAIL FROM / RCPT TO / DATA，支持 465 TLS 直连与 587 STARTTLS，
   正文 base64 UTF-8，头部 UTF-8 编码），`credentials.ts` 负责 `data/mail/mail-credentials.json`
   的读写与字段校验，全程不打印密码。
2. `scripts/mail-config.ts` + `npm run mail:config`：命令行配置 SMTP host/端口/账号/授权码/发件人，
   写入 `data/mail/`（git 忽略）。
3. office-daily 邮件模式扩展：
   - “发送/发出去/发给”邮件查询 → 发送流程：解析收件人/主题/正文，缺项诚实提示；
   - 生成草稿时同步落盘 `latest-draft.json`，支持“把刚才那封发出去”两段式（先预览再发）；
   - 未配置凭据诚实提示 `npm run mail:config`；发送成功返回 From/To/主题预览。
4. 意图层：`office_daily` ACTION_RE 增加“发邮件/发送邮件/邮件发出”关键词（排在 `send` 前），
   邮件发送路由到 office_daily，不再偏到 im_dispatch（发消息/发微信仍走 send）。
5. 测试：SMTP 客户端本地假 SMTP 服务器真跑全命令序列；TLS 直连用 Python cryptography
   生成自签证书门控测试；凭据读写；office-daily 发送流程（未配置/缺收件人/草稿两段式）；
   router 发邮件路由。
6. 文档：附录 A 登记 E170、`src/skills/README.md` office-daily 行、handoff。

**验收标准**

- `发送邮件给 a@b.com，主题：测试，正文：你好`（已配置凭据）→ 真发成功，返回 From/To/主题。
- 未配置凭据 / 缺收件人 / 缺正文 → 诚实提示，不产生任何外发。
- “写封邮件…”只落草稿；“把刚才那封发出去”用最近草稿发送。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 执行过程

### 改动

- `src/mail/smtp.ts`（新增）：最小 SMTP 客户端（node:net/node:tls），secure=465 TLS 直连 / 587 STARTTLS，
  AUTH LOGIN，正文 base64 UTF-8，头部 RFC 2047 编码，错误信息不含密码。
- `src/mail/credentials.ts`（新增）：`data/mail/mail-credentials.json` 读写与字段校验（host/port/secure/user/pass/from）。
- `scripts/mail-config.ts` + `npm run mail:config`：命令行配置 SMTP 凭据，密码不打印。
- `src/skills/office-daily/index.ts`：email 模式新增显式发送流程（发送/发出去/发给/发信 →
  收件人/主题/正文缺项诚实提示 → 未配置凭据提示 mail:config 且不发送 → sendMail 真发并回显
  From/To/主题）；写草稿（会议邀请/回复邮件）同步落盘 `latest-draft.json` 支持“把刚才那封发出去”。
- `src/agent/intent-feature.ts`：office_daily 关键词增加“发邮件/发送邮件/邮件发出”，发送邮件路由到
  office_daily（排在 send 前），发消息/发微信仍走 im_dispatch。

### 遇到的问题

- `secure: true` 直连路径最初复用明文连接后再升级，导致 TLS 服务器无响应超时；改为 secure 直连
  tls.connect 后通过。
- PowerShell 文本拼接多次引入函数头丢失/重复行，逐一修复并由 tsc 与全量测试兜底。

## 结果

- 验证：`npm run build`、`npm run test:all`、`npm exec tsx scripts/doc-lint.ts`（0 FAIL 0 WARN）全绿。
- 测试：单测 509/509 + 1 条 fitz 门控跳过 + 集成 17/17；新增 14 条（SMTP 全命令序列/TLS 门控/
  认证失败/凭据读写/未配置/缺收件人/真发成功/两段式发送/路由）。
- 提交：`b0a21b4`（E170/E171 批次）· 推送：待 push:hosts
- 遗留事项：.ics 导入（E169 只有导出）、UI 集成新能力、表格识别复杂表头/合并单元格。
