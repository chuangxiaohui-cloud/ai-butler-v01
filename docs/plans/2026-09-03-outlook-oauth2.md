# 推进计划：Outlook OAuth2（XOAUTH2）邮箱通道——代码最小闭环

> 日期：2026-09-03 · 分支：v0.2b · 状态：已完成（代码最小闭环；未提交）

## 目标

让邮箱通道支持 Outlook.com / Microsoft 365 收件。Outlook 已禁用 IMAP 密码基本认证（实测 `NO Basic authentication is disabled.`），只能走 OAuth2（XOAUTH2）。owner 的卡点是 Azure 应用注册一直失败，因此本轮只做**不依赖注册成功的代码最小闭环**：凭据模型 + IMAP XOAUTH2 报文 + 注册操作清单，注册一成功即可真连联调。

## 计划

1. `src/mail/credentials.ts`：`SmtpCredentials` 增加可选 `auth`（`password`/`xoauth2`）与 `clientId/tenant/refreshToken/accessToken` 字段；`validateCredentials`/`normalizeCredentials` 适配（xoauth2 免密码、校验 accessToken；旧 password 账号行为不变）。→ 验证：既有凭据单测 + 新增用例全绿。
2. `src/mail/imap.ts`：导出 `buildXoauth2Initial()`（RFC 4959 初始响应 base64）；`openSession` 增加 `AUTHENTICATE XOAUTH2 <base64>` 分支；`ImapSession.pump()` 支持 `+` 续行（失败时回空行取消，避免挂起超时）。→ 验证：新增单测覆盖成功 / 失败续行 / 不落明文日志。
3. `scripts/mail-config.ts`：支持 `--auth/--client-id/--tenant/--access-token/--refresh-token`（xoauth2 免 `--pass`）。
4. 本文档附录 A：面向 owner 的「Outlook OAuth2 Azure 注册操作清单」。
5. 验证：`npm run build` → 定向 mail 单测 → 全量单测 + 集成；不改需求文档（本批未提交，附录 A E321 登记随提交批执行）。

**验收标准**

- xoauth2 账号收件走 `AUTHENTICATE XOAUTH2`，不出现 `LOGIN`，token 不落明文日志
- token 无效时收到 `+` 续行后能回空行拿到 tagged NO，报「重新授权」，不挂起超时
- password 账号（QQ/163 等）行为与旧版完全一致
- 编号沿用 E321（暂定），随提交批登记需求文档附录 A

## 执行过程

### 改动

- `src/mail/credentials.ts`：新增 `MailAuth` 类型；`SmtpCredentials` 增加 `auth/clientId/tenant/refreshToken/accessToken` 可选字段；`validateCredentials` 增加 auth 合法性检查与 xoauth2 分支（免 pass、要求 accessToken、可选续期字段）；`normalizeCredentials` 透传新字段（旧文件不新增 auth 键，形状不变）。
- `src/mail/imap.ts`：`buildXoauth2Initial()` 导出（`base64("user="+user+"\x01auth=Bearer "+token+"\x01\x01")`）；`openSession` 在 `creds.auth === 'xoauth2'` 时先校验 accessToken，再发 `AUTHENTICATE XOAUTH2 <base64>`，失败抛「IMAP XOAUTH2 认证失败…请重新授权」；`pump()` 对 `+` 续行回 `CRLF` 空行取消（仅 XOAUTH2 失败路径会触发，既有命令不受影响）；5 处 creds 内联类型（openSession + 4 个收信入口）补齐 `auth/accessToken`。
- `scripts/mail-config.ts`：新增 `--auth/--client-id/--tenant/--access-token/--refresh-token`；`--auth xoauth2` 时免 `--pass`（pass 落空串）；保存后打印认证方式。
- 测试：`src/mail/credentials.test.ts` +2（xoauth2 凭据往返、校验分支）；`src/mail/imap.test.ts` +3（base64 编码向量、TLS 假服务器走 XOAUTH2 成功且 token 不落日志、`+` 续行失败 → 明确报错），假服务器支持 `AUTHENTICATE XOAUTH2` 与空行取消握手。

### 遇到的问题

- PowerShell 落盘会吞反引号 / `${}` 字面量且仓库为 LF 行尾——补丁统一用 python 字节级字符串替换（锚点避开中文、不做 CRLF 转换）。
- 全量集成首跑 1 条失败：`quote-compare` 模块加载期 `database is locked`（并行用例竞争 SQLite，与本次改动无关）；复跑集成 32/32 绿。

## 结果

- 验证：`npm run build` 绿；`node --test dist/mail/credentials.test.js dist/mail/imap.test.js` 41/41；全量单测 1313 总（1312 过 + 1 skip 既有）0 fail；集成 32/32；全程零外部 LLM/API（IMAP 假服务器本地回环）。
- 提交：本轮未提交（owner 指示 git 暂不提交、先推进其他；E318/E319/E320 同批待拍板）。
- 遗留事项：
  - 真连联调：owner 按附录 A 注册成功 → 浏览器授权一次拿 `access_token` → `npm run mail:config` 落地 → 对 AI-Butler 说「查 outlook 邮箱收件箱」。
  - `refreshToken` 自动续期未实现（access token 约 1 小时过期），属下一候选。
  - Outlook SMTP 发信同样禁用密码认证，`smtp.ts` 的 XOAUTH2 未做，属下一候选；当前 xoauth2 账号可收不可发。
  - 需求文档附录 A（E321）、`docs/code-directory.md`/`docs/directory-structure.md` 登记随提交批执行。

## 追加（2026-09-03 第 2 轮）：设备码授权 CLI（`mail:oauth`）

- **背景**：owner 拍板第 2 步做「浏览器设备码授权自动落盘」，解决 Azure 注册成功后还要 curl/msal 手工拼 token 的问题。
- **改动**：
  - `src/mail/oauth.ts`（新）：微软 OAuth2 设备码流核心——`requestDeviceCode()` 申请码 + `pollDeviceToken()` 轮询换 token；只依赖 node 原生 fetch，不新增外部依赖；token 不打印、不进日志；`fetcher` 可注入供离线单测。
  - `scripts/mail-oauth.ts`（新，`npm run mail:oauth`）：`--client-id <应用ID> --user <outlook邮箱> [--account outlook] [--tenant consumers] [--scope …] [--open]`；打印验证地址+码（可选 `--open` 自动开浏览器）→ 轮询 → 自动写 `data/mail/mail-credentials.json`（保留既有账号的服务器参数；新账号按 Outlook 默认 smtp.office365.com:587 / outlook.office365.com:993 TLS）。
  - `package.json`：注册 `mail:oauth`。
- **验证**：build 绿；`src/mail/oauth.test.ts` 5 条（设备码表单/字段、AADSTS 4xx 报错、token 成功映射、pending/slow_down 重试、declined/expired 终态）；mail 定向 46/46；全量单测与集成见「结果」；零外部网络（全部假 fetcher/假 IMAP 服务器）。
- **遗留变化**：access token 自动续期（refreshToken）仍未做，属下一候选；SMTP 发信 XOAUTH2 仍属下一候选。

## 追加（2026-09-03 第 3 轮）：refreshToken 自动续期（A）

- **背景**：Azure 注册暂搁置（owner：后续再做），拍板先做 A——access token 约 1 小时过期，不能每次要 owner 重跑授权。
- **改动**：
  - `src/mail/oauth.ts`：新增 `xoauthExpirySeconds()`（解 JWT exp；非 JWT 视为未知）、`refreshAccessToken()`（grant_type=refresh_token，支持 refresh token 轮换，invalid_grant 等终态明确报错）、`loadXoauthCredentials()`（加载凭据：xoauth2 且 token 缺失/剩 5 分钟内临期 → 自动刷新并回写文件；password 账号不联网、缺续期条件原样返回）。
  - `src/skills/office-daily/index.ts`：3 个 IMAP 读信口（收件箱/搜信/下载附件）由 `loadCredentials` 换为 `await loadXoauthCredentials(...)`；SMTP 发信口保持原样（发信 XOAUTH2 仍属候选 B）。
- **验证**：build 绿；oauth 新增 6 条离线用例（exp 解析、刷新成功+轮换、invalid_grant、过期自动刷新回写、有效 token 零网络、password/缺续期条件原样返回）；mail 定向 52/52；全量单测与集成见「结果」；零外部网络。
- **遗留变化**：SMTP 发信 XOAUTH2 仍属候选 B；scope 变化（如加 SMTP.Send）需在刷新时同步携带，当前刷新固定 IMAP scope，后续 B 一并处理。

## 附录 A：Outlook OAuth2 Azure 注册操作清单（owner 侧，约 10 分钟）

目标：个人 Outlook/Hotmail 邮箱 → 拿到 access token → 本地收信。

### 注册总是不成功的最常见 3 个坑

1. **账户类型选错**：个人 Outlook/Hotmail 是 consumer 账户，不要选「仅此组织目录中的账户」；要选「任何组织目录中的账户和个人 Microsoft 账户」或「个人 Microsoft 账户」。
2. **平台/重定向 URI 错**：桌面/脚本要用「移动和桌面应用程序」平台，重定向 URI `https://login.microsoftonline.com/common/oauth2/nativeclient`（不要用 Web 平台那一套）。
3. **Scope 前缀错**：IMAP 授权 scope 必须是 `https://outlook.office.com/IMAP.AccessAsUser.All`，不是 `https://graph.microsoft.com/...`（后者 token 在 IMAP 上不工作）。

### 操作步骤

1. 打开 [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID → 应用注册 → 新建注册。
2. 名称随意（如 `ai-butler-mail`）→ 受支持的账户类型：`Accounts in any organizational directory and personal Microsoft accounts`（或只选 personal）→ 注册。
3. 「管理 → 认证」→ 平台配置 → 添加平台 → **移动和桌面应用程序** → 重定向 URI 填 `https://login.microsoftonline.com/common/oauth2/nativeclient`；保存后确认「允许公共客户端流」= 是。
4. 「管理 → API 权限」→ 添加权限 → 选 **Office 365 Exchange Online** → 委托的权限 → 勾 `IMAP.AccessAsUser.All`（如后续要发信再加 `SMTP.Send`，要 POP 再加 `POP.AccessAsUser.All`）。
5. 「概述」页复制 **应用程序(客户端) ID**。
6. 一键授权并落地（推荐，走设备码流，无需手工拼 code/token）：

   ```
   npm run mail:oauth -- --client-id <应用ID> --user <outlook邮箱> --open
   ```

   脚本会打印验证地址+码并自动开浏览器（`--account` 缺省 outlook、`--tenant` 缺省 consumers）；授权成功后自动把 access/refresh token 写入 `data/mail/mail-credentials.json`（git 忽略、不打印）。想手工走授权码流的旧做法：`curl`/python+msal 走 `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize`（redirect_uri 用 `https://login.microsoftonline.com/common/oauth2/nativeclient`）换 token 后，用下方 `mail:config` 命令落地亦可。

7. （手工拿到 token 时）也可用 `mail:config` 落地：

   ```
   npm run mail:config -- --account outlook --host smtp.office365.com --port 587 --secure 0 --imap-host outlook.office365.com --imap-port 993 --imap-secure 1 --user <outlook邮箱> --from <outlook邮箱> --auth xoauth2 --client-id <应用ID> --tenant consumers --access-token <access_token> --refresh-token <refresh_token>
   ```

8. 真连自检：把 JWT 贴到 [jwt.ms](https://jwt.ms) 看 `aud` 必须是 `https://outlook.office.com`；报 `AADSTS70011` 是 scope 前缀错；报 `NO AUTHENTICATE failed` 是 token 过期或没授权 IMAP，重走第 6 步。
