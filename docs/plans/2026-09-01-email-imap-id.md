# 推进计划：163 收件兼容——IMAP ID 命令声明客户端身份

> 日期：2026-09-01 · 分支：v0.2b · 状态：完成（E303）
> 关联：E302 多账号真实冒烟（owner 实测 2026-09-01）/ owner 反馈「没有提醒短信验证码，只是提示邮箱在其他设备登录」

## 目标

E302 真实冒烟配置 163 账号（netease）后「查收件箱」返回：
`收信失败：IMAP 命令失败：NO SELECT Unsafe Login. Please contact kefu@188.com for help`。

owner 确认：登录时 163 只提示「邮箱在其他设备登录」、未要求短信验证码 → 账号密码/授权码本身有效，问题在 IMAP 服务器在 SELECT 阶段要求客户端先发送 ID 命令（RFC 2971）声明客户端身份，否则拒绝（Unsafe Login）。

本次在 LOGIN 成功后、首个 SELECT 前，对网易系 IMAP 主机（163.com / 126.com）发送
ID ("name" "ai-butler-v01" "version" "0.1.0")，其他服务器不发送（老服务器对非标准 ID 命令可能回 BAD，避免影响既有收件）。

## 计划

1. src/mail/imap.ts openSession()：LOGIN 成功后若 cfg.host 命中网易（/163\.com$|126\.com$/i）发 ID (...)，再 return session；新增 needsImapId(host) 判定。
2. 测试：src/mail/imap.test.ts 假 IMAP 服务器补 ID 命令响应；新增单测——163 主机 LOGIN 后发 ID（且 ID 在 LOGIN 之后）、非网易主机不发 ID。
3. 文档：附录 A 登记 E303、当日 handoff 补一节。

## 验收标准

- npm run build 绿；imap 相关单测全绿；npm run doc-lint 0 FAIL 0 WARN。
- 163 主机登录后、SELECT 前发 ID ("name" "ai-butler-v01" "version" "0.1.0")；非网易主机不发。

## 执行过程

### 改动

- src/mail/imap.ts：needsImapId(host)（网易 163.com/126.com 判定）+ openSession LOGIN 后按需发 ID。
- src/mail/imap.test.ts：假服务器 handleImapSocket 补 ID 响应；新增 2 条单测。
- 附录 A E303；docs/2026-09-01-progress-handoff.md 补一节。

### 遇到的问题

- 假 IMAP 服务器连接走 `127.0.0.1`，`cfg.host`（IMAP 主机）无法用 163 域名命中判定 → `needsImapId` 改按 `creds.host`（SMTP provider 主机，`smtp.163.com`）判定，单测可注入 `host: 'smtp.163.com'` + `imapHost: '127.0.0.1'` 验证。
- 附录 A 单行条目过长，apply_patch 需整行上下文，改用 PowerShell 锚定 E302 行插入 E303 条目（UTF-8 无 BOM 保留）。

## 结果

### 完成

- `src/mail/imap.ts`：`needsImapId(host)`（`/163\.com$|126\.com$/i`）+ `openSession` LOGIN 后按需发 `ID ("name" "ai-butler-v01" "version" "0.1.0")`。
- `src/mail/imap.test.ts`：假服务器补 ID 响应；新增 2 条单测（163 发 ID / 非网易不发）。
- `src/skills/office-daily/index.test.ts`：假服务器补 ID 响应（同一链路防 BAD）。
- 附录 A E303；`docs/2026-09-01-progress-handoff.md` 第 5 节。

### 验证

- `npm run build` 绿；imap 29/29、office-daily 78/79（1 skip 为既有 PDF 用例）；`npm run doc-lint` 0 FAIL 0 WARN。
- 真实 163 冒烟待 owner：`npm run dev -- "用 163 邮箱查收件箱"`（active=netease）。
