# 推进计划：SMTP 发信 XOAUTH2（候选 B，E322）

> 日期：2026-09-03 · 分支：v0.2b · 状态：已完成
> 承接：`docs/2026-09-03-progress-handoff.md`「明日待办 候选 B」；E321 收信 OAuth2 三轮回合之后，把同一套 XOAUTH2 延伸到发信。
> 前置：Outlook 已禁用 IMAP/SMTP 密码基本认证（实测 `NO Basic authentication is disabled.`）；SMTP 发信必须走 XOAUTH2。Azure 应用注册仍未成功 → 本批只做「代码最小闭环 + 离线用例」，真连验收待 owner 注册成功后补。

## 目标

让 `office-daily` 发信链路支持 xoauth2 账号：SMTP 用 `AUTH XOAUTH2`（RFC 4959）替代 `AUTH LOGIN`，发信前自动用 refresh token 续期（刷新 scope 扩为 IMAP+SMTP），新授权默认覆盖读信+发信两个权限。

## 计划

1. `src/mail/oauth.ts`：新增 `OUTLOOK_SMTP_SCOPE` 与 `OUTLOOK_MAIL_SCOPE`（IMAP + SMTP.Send + offline_access）；设备码授权与 refresh 的缺省 scope 改为合并 scope；把 `buildXoauth2Initial`（RFC 4959 SASL 初始响应）从 imap 移入 oauth，供 IMAP/SMTP 共用。
2. `src/mail/smtp.ts`：`auth === 'xoauth2'` 时走 `AUTH XOAUTH2 <initial>`（334 空挑战 → 回空行），成功 235；失败明确报「缺 SMTP 权限/请重新授权」，错误不含 token；H4 明文拒绝覆盖 XOAUTH2。
3. `src/skills/office-daily/index.ts`：发信口凭据加载由 `loadCredentials` 改为 `await loadXoauthCredentials(...)`（与三个 IMAP 读信口一致，发信前自动续期）。
4. `scripts/mail-oauth.ts`：缺省 scope 改 `OUTLOOK_MAIL_SCOPE`，帮助与完成提示补「可发信」。
5. 补/改离线用例：smtp XOAUTH2 成功/失败/缺 token（TLS 假服务器）、oauth 合并 scope 断言与 refresh scope 证据、office-daily xoauth2 发信闭环。
6. 登记附录 A E322 + 更新当日交接。

**验收标准**

- build 绿；smtp/oauth/office-daily 定向单测全绿；全量 `npm run test:all` 无新增失败。
- xoauth2 账号在 TLS 假服务器上发信：transcript 出现 `AUTH XOAUTH2` 且无 `AUTH LOGIN`/明文密码；token 无效时明确报错且不含 token。
- 发信路径调用 `loadXoauthCredentials`（刷新 scope=IMAP+SMTP），新授权 devicecode 请求含两个权限。
- `npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（零成本）。

## 执行过程

### 改动

- `src/mail/oauth.ts`：加 `OUTLOOK_SMTP_SCOPE` / `OUTLOOK_MAIL_SCOPE`；`requestDeviceCode`/`refreshAccessToken`/`loadXoauthCredentials` 缺省 scope 切到合并 scope；迁入 `buildXoauth2Initial`（RFC 4959，IMAP/SMTP 共用）。
- `src/mail/imap.ts`：删除本地 `buildXoauth2Initial`，改从 `./oauth.js` 导入并 re-export（对外引用面不变）。
- `src/mail/smtp.ts`：认证分支按 `auth` 分流——`xoauth2` 走 `AUTH XOAUTH2`（支持 334 空挑战），失败错误说明「缺少 SMTP 权限/重新授权」，不含 access token；明文拒绝分支覆盖 XOAUTH2 通告。
- `src/skills/office-daily/index.ts`：发信口 `loadCredentials` → `await loadXoauthCredentials`（去掉不再使用的 `loadCredentials` 导入）。
- `scripts/mail-oauth.ts`：缺省 scope 用合并 scope；帮助文本与授权完成提示补发信。
- 测试：`src/mail/smtp.test.ts`（TLS 假服务器支持 XOAUTH2 + 3 条新用例）、`src/mail/oauth.test.ts`（缺省 scope 断言改合并 scope + loadXoauthCredentials 刷新请求 scope 证据）、`src/mail/imap.test.ts`（无改动，re-export 保兼容）、`src/skills/office-daily/index.test.ts`（xoauth2 账号发信闭环 1 条）。

### 遇到的问题

- XOAUTH2 认证握手：微软系服务器失败时会以 334 + base64 挑战回推错误，客户端须回空行收尾态；处理为「334 → 回空行 → 再收一行判 235/失败」。
- refresh scope 与授权 scope 一致性：收信口（IMAP）与发信口（SMTP）共用 `loadXoauthCredentials`，本批把刷新缺省 scope 统一扩为 IMAP+SMTP；纯 IMAP 授权的老账号在并发新账号不存在（Azure 注册未成功），续期遇权限不足时报错引导重新 `npm run mail:oauth`。

## 结果

- 验证：`npm run build` 绿；定向单测 mail+office-daily 合并 141/141（140 过 + 1 既有 skip）——smtp 8/8（新增 3 条 XOAUTH2：TLS 334 挑战成功 / token 无效报错不含 token / 缺 accessToken 指引）、oauth 12/12（新增 1 条合并 scope 锚）、imap 32/32、credentials 9/9、office-daily 80/80（新增 1 条 xoauth2 发信闭环）；全量单测 1328 过 + 1 skip 既有（1329 total）+ 集成 32/32；`npm run doc-lint` 0 FAIL 0 WARN；零外部 LLM/API。
- 能力：xoauth2 账号发信（AUTH XOAUTH2）、发信前自动续期（scope 含 SMTP.Send）、新授权默认读信+发信权限。
- 遗留：真连验收待 owner 完成 Azure 注册后执行 `npm run mail:oauth -- --client-id <ID> --user <outlook邮箱> --open`，然后对 AI-Butler 说「发送邮件给 …，主题：…，正文：…」验证发信 + 临期续期。
- 提交：未提交（延续工作区待统一确认批次；附录 A 登记随既有 E321 批次节奏）。
