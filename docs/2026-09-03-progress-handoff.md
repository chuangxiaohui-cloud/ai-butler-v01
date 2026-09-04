# 进度交接 2026-09-03（Outlook OAuth2 收信闭环：E321 三轮推进）

> 当前分支：v0.2b｜本轮收口：Outlook OAuth2（XOAUTH2）邮件通道三轮推进——代码最小闭环 → 设备码授权 CLI（`mail:oauth`）→ refreshToken 自动续期。Azure 注册仍卡在 owner 侧（暂搁置，后续再做）。
> 上一份交接见 `docs/2026-09-02-progress-handoff.md`（通知枢纽 E315/E316 + §COST E317 + E318/E319/E320）。

## 今日完成

### 1. Outlook OAuth2（XOAUTH2）代码最小闭环（E321·第 1 轮）

- **背景**：owner 拍板做 Outlook 第二邮箱；Outlook 已禁用 IMAP 密码基本认证（实测 `NO Basic authentication is disabled.`）；卡点是 Azure 应用注册一直失败 → 本轮只做不依赖注册成功的代码闭环 + 注册操作清单。
- **代码**：
  - `src/mail/credentials.ts`——新增 `MailAuth = 'password' | 'xoauth2'`；`SmtpCredentials` 增加可选 `auth/clientId/tenant/refreshToken/accessToken`；`validateCredentials` xoauth2 分支（免密码、要求 accessToken）+ `normalizeCredentials` 透传（旧文件形状不变）。
  - `src/mail/imap.ts`——导出 `buildXoauth2Initial()`（RFC 4959：`base64("user="+user+"\x01auth=Bearer "+token+"\x01\x01")`）；`openSession` 按 `auth` 分支走 `AUTHENTICATE XOAUTH2`，失败报「请重新授权」；`ImapSession.pump()` 支持 `+` 续行（失败回空行取消，避免挂起超时）；5 处 creds 内联类型补齐。
  - `scripts/mail-config.ts`——支持 `--auth/--client-id/--tenant/--access-token/--refresh-token`（xoauth2 免 `--pass`）。
- **验证**：build 绿；mail 定向 41/41；全量单测 1312 过 + 1 skip 既有；集成 32/32；零外部 LLM/API。
- **文档**：`docs/plans/2026-09-03-outlook-oauth2.md`（含附录 A：Azure 注册操作清单与常见 3 坑）。

### 2. 设备码授权 CLI（E321·第 2 轮，owner 选 2）

- **代码**：`src/mail/oauth.ts`（新）——设备码流核心 `requestDeviceCode()` + `pollDeviceToken()`（pending/slow_down 可重试，declined/expired 终态明确报错），只依赖 node 原生 fetch，fetcher 可注入供离线单测；`scripts/mail-oauth.ts`（新，`npm run mail:oauth`）——`--client-id --user [--account outlook] [--tenant consumers] [--scope …] [--open]`，浏览器授权后自动落盘 token；`package.json` 注册脚本。
- **验证**：oauth 5 条离线用例；mail 定向 46/46；零外部网络。
- **文档**：同一 plan 文档追加第 2 轮；附录 A 第 6 步改为推荐 `mail:oauth` 一键授权。

### 3. refreshToken 自动续期（E321·第 3 轮，owner 选 A）

- **代码**：`src/mail/oauth.ts` 新增 `xoauthExpirySeconds()`（JWT exp 解析，非 JWT 视为未知）、`refreshAccessToken()`（grant_type=refresh_token，支持 refresh 轮换、invalid_grant 明确报错）、`loadXoauthCredentials()`（xoauth2 且 token 缺失/剩 5 分钟内临期 → 自动刷新并回写凭据文件；password 账号不联网、缺续期条件原样返回）；`src/skills/office-daily/index.ts` 的 3 个 IMAP 读信口（收件箱/搜信/下载附件）改 `await loadXoauthCredentials(...)`，实现「查 outlook 邮箱」token 过期自动续期。
- **验证**：oauth +6 条离线用例；mail 定向 52/52；全量单测 1323 过 + 1 skip 既有（1324 total）；集成 32/32；全程零外部网络（假 fetcher / 假 IMAP 服务器）。
- **文档**：同一 plan 文档追加第 3 轮。

## 明日待办（接续点）

1. **（owner 侧）Azure 注册 + 真连验收**：按 `docs/plans/2026-09-03-outlook-oauth2.md` 附录 A 注册（账户类型选 personal、平台选「移动和桌面」、scope 用 `outlook.office.com` 前缀），拿到「应用程序(客户端) ID」后运行：
   `npm run mail:oauth -- --client-id <应用ID> --user <outlook邮箱> --open` → 浏览器授权自动落盘 → 对 AI-Butler 说「查 outlook 邮箱收件箱」验证收信与临期自动续期。
2. **候选 B：SMTP 发信 XOAUTH2**（Outlook 发件同样禁密码；届时把刷新 scope 扩为 IMAP+SMTP）。代码与离线用例齐了，但真连仍需 owner 先注册成功。
3. **提交批次**：E318/E319/E320（上一批已完成未提交）+ 本日 E321（三轮）——补需求文档附录 A E321 登记、`docs/code-directory.md` / `docs/directory-structure.md` 的模块行后一起提交（owner 此前指示 git 暂不提交、先推进其他）。

## 后续候选（沿用 09-02，未启动）

- **E309-后：confirm 阻断式（后续轮）**：记录侧批准/否决面板已随 E323 落地（2026-09-03）；真阻断语义（高风险操作执行前停住等批准 + 成本提示）仍待后续轮。
- **通知库 UI 展示 / 目录监听**：右栏通知区 UI 展示与 projects/ 目录文件变更监听属 §4.1 三栏交互 UI 阶段。
- **v2.6 pre-ship 封版确认 / v1.0 大章节**：见 09-02 交接（P-10 唯一阻塞 L2 成熟度待 owner 累积）。

**预估成本(¥)**：¥0（本日全部为本地实现 + 离线假服务器/假 fetcher 单测；无 LLM/API 付费调用）。

## 追加轮：候选 B——SMTP 发信 XOAUTH2（E322）已收口（2026-09-03）

> owner 指令「候选B吧」，且确认 Azure 注册仍未成功、真连验收继续挂起。本批沿用 E321「代码最小闭环 + 离线用例」模式，不依赖注册。

### 已完成

1. **`src/mail/oauth.ts`**：新增 `OUTLOOK_SMTP_SCOPE`（SMTP.Send）与 `OUTLOOK_MAIL_SCOPE`（IMAP+SMTP+offline_access）；设备码授权与 refresh 缺省 scope 扩为合并 scope；`buildXoauth2Initial`（RFC 4959）自 imap 迁入 oauth 供 IMAP/SMTP 共用。
2. **`src/mail/smtp.ts`**：`auth === 'xoauth2'` 走 `AUTH XOAUTH2 <initial>`（334 空挑战回空行），失败明确报「缺 SMTP 发信权限/请重新授权」且不含 token；H4 明文拒绝分支覆盖 XOAUTH2 通告。
3. **`src/skills/office-daily/index.ts`**：发信口凭据加载 `loadCredentials` → `await loadXoauthCredentials`（与三个 IMAP 读信口一致，发信前自动续期）。
4. **`scripts/mail-oauth.ts`**：缺省 scope 改合并 scope；帮助与完成提示补「可发信」。
5. 登记附录 A E322；计划 `docs/plans/2026-09-03-smtp-xoauth2.md`。

### 验证（全程零外部 LLM/API）

- `npm run build` 绿；定向单测 mail+office-daily 合并 141/141（140 过 + 1 既有 skip：smtp 8、oauth 12、imap 32、credentials 9、office-daily 80，新增 5 条）；全量单测 1328 过 + 1 skip 既有（1329 total）+ 集成 32/32；doc-lint 0 FAIL 0 WARN。

### 明日待办更新

- **（owner 侧，暂停）Azure 注册 + 真连验收**：owner 2026-09-03 晚拍板「Azure 先暂停，一时半会都搞不了」。E321/E322 的 Outlook 真连验收与 mail:oauth 授权整体挂起，解除暂停后再执行：注册成功后 `npm run mail:oauth -- --client-id <应用ID> --user <outlook邮箱> --open` 授权（scope 已含 SMTP.Send）→ 对 AI-Butler 说「查 outlook 邮箱收件箱」验证收信、说「发送邮件给 …」验证 XOAUTH2 发信与临期自动续期。QQ/163 等 password 账号链路不受影响、继续可用。
- **提交批次（文档侧已收口）**：E318/E319/E320（附录 A 已登记、代码未提交）+ E321（附录 A 已补登记，见下）+ E322（附录 A 已登记）——本批追加轮已同步补 `docs/code-directory.md` / `docs/directory-structure.md` / `AGENTS.md` 的 `src/mail` 模块行；剩余 git 提交动作待 owner 指示（此前「暂不提交、先推进其他」）。

### 追加轮 2：批次文档收口（E321 附录 A 登记 + src/mail 模块行，2026-09-03）

- 需求文档附录 A 补 E321 登记（三轮：凭据模型 + IMAP XOAUTH2 / 设备码 CLI `mail:oauth` / refreshToken 自动续期，证据与文件面见登记条目），与 E322 同日相邻。
- `docs/code-directory.md` / `docs/directory-structure.md` / `AGENTS.md` 目录地图补 `src/mail/` 模块行（此前 mail 模块存在但三处索引均未登记）。
- 验证：`npm run doc-lint` 0 FAIL 0 WARN；纯文档变更，无代码/测试重跑（E321/E322 代码验证此前已全绿）。

## 追加轮 3：人类裁决批准/否决面板（E323，2026-09-03）

> owner 拍板「同意你的推荐」：先做非破坏记录侧（decision-log 已有 pending → UI 面板 + 裁决回填），不做 confirm 真阻断语义（待后续轮）。

### 已完成

1. **`src/escalation/decision-log.ts`**：`DecisionLogEntry` 增可选 `refId`；新增 `openDecisions()`（decision=pending 且未被裁决事件引用 → 待裁决队列）与 `adjudicate(id, decision, input)`——append-only 追加 `decision=approve/reject` + `refId` 指向原行的裁决事件（复制 question/options/confidence 自描述），不改写原 pending 行；区分 not_found / already_decided。
2. **gateway**：`GET /api/decisions`（只读，返回 open 队列）+ `POST /api/decisions/:id`（写端点挂 `requireGatewayAuth`，400 非法 decision / 404 不存在 / 409 已裁决）；`GatewayOptions.decisionLog` 注入供测试隔离。
3. **UI**：右栏新增「裁决」页（Gavel Tab）——待裁决卡片（question/options/触发源/会话/置信/时间）+ 备注（可选）+ 批准/否决按钮，POST 后刷新；30s 轮询 + 手动刷新；空态与网关不可达提示；`styles.css` 最小卡片样式。
4. 文档：计划 `docs/plans/2026-09-03-decisions-ui.md`；需求文档附录 A E323 登记；`docs/directory-structure.md` gateway 端点表与 `docs/code-directory.md`（escalation/UI 行）同步。

### 验证（全程零外部 LLM/API，¥0）

- `npm run build` 绿；decision-log 3/3 + gateway 26/26（各新增 1 条 E323 用例）；`npm --prefix ui/prototype run build`（tsc + vite）绿；`npm run doc-lint` 0 FAIL 0 WARN。

### 后续候选更新

- **confirm 真阻断**：第一刀已随 E324 落地（追加轮 5，写类执行器挂起 + 聊天批准恢复）；本次操作预估成本提示与面板自动恢复留第二刀。
- **提交批次**：E318-E323 代码均未提交（含 E320 通知 UI、E321/E322 邮件 OAuth2、E323 裁决面板），待 owner 指示统一提交。
- **owner 手动验收**：已通过（追加轮 4，2026-09-03）。

## 追加轮 4：E323 owner 手动验收通过（2026-09-03）

> 验收方式：owner 浏览器访问 gateway（`npm run gateway` → http://127.0.0.1:8787），在 `data/decision-log.jsonl` 手动预置一条 pending 测试数据后，走右栏「裁决」页操作。

### 结果

- **批准 ✅ / 否决 ✅**：点按钮后卡片即从待裁决队列消失；`data/decision-log.jsonl` 以 append 方式新增裁决事件（含 `decision=approve/reject`、`refId` 指回原 pending 行、备注原样入库）；原 pending 行保持 pending 不被改写。
- **发现一个手工埋数据的坑**：手动往 JSONL 末尾贴数据时若结尾不带换行，程序 append 的新事件会与上一行挤成一行，导致整行解析失败（卡片消失、记录读不到）。程序侧所有写入路径均自带行尾换行，纯属外部手改不满足「每条一换行」约定所致；已当场拆行修复。
- **清理还原（owner 选方案 1）**：测试产生的假 pending 与 approve/reject 事件全部删除；还原过程中 Agent 清理脚本因 PowerShell 单字符串下标误用一度写坏文件（只剩 `{`），已按已知内容完整恢复并通过 JSON 解析校验。当前 `data/decision-log.jsonl` 仅 1 行（conversationId=cli 的真实澄清 pending，279 字节、行尾有换行）。

### 遗留

- confirm 真阻断第一刀已随 E324 落地（追加轮 5）；成本提示/面板自动恢复/风险分级留第二刀。
- conversationId=cli 的那条真实 pending 属早期 CLI 澄清留下的历史记录，按 owner 选择保留，未来可裁决或清理。

## 追加轮 5：confirm 真阻断第一刀（E324，2026-09-03）

> owner 拍板「就按你的推荐」：先做第一刀（待批准动作 + 聊天批准恢复执行），试点写类执行器；风险分级/成本提示/面板自动恢复留第二刀。

### 已完成

1. **`src/escalation/decision-log.ts`**：`DecisionLogEntry` 增可选 `resume{query,executor}`（批准后恢复载荷）；新增 `pendingForConversation()`（返回某会话最近一条带 resume 的 open pending，裁决后回退上一条）。
2. **`src/escalation/confirm-gate.ts`（新）**：试点写类执行器清单（project_writer/content_writer/office_daily/calendar_skill/im_dispatch/project_packager）、`isConfirmWriteExecutor`、`parseApprovalReply`（整句剥尾部语气词/标点后匹配批准/取消词表，正文不误伤）、`buildConfirmHoldAnswer` 等待确认文案。
3. **`src/search/pipeline.ts`**：入口预检（同会话带 resume 的 open pending + 整句批准/取消 → approve 带 `confirmResume` 标记递归重放原请求恢复执行 / reject 记「已取消」）；拦截点（confirm + 写类执行器 + 有会话上下文 → 写 pending 含 resume + 通知「待你裁决」+ 返回等待确认文案，不直接执行；已有 open pending 则提示先处理）；一次性 CLI（无会话）不挂起维持原行为，避免孤儿待批。
4. 文档：计划 `docs/plans/2026-09-03-confirm-blocking.md`；需求文档附录 A E324 登记；`docs/code-directory.md` escalation 行补 confirm-gate.ts/E324。

### 验证（全程零外部 LLM/API，¥0）

- `npm run build` 绿；decision-log 4/4 + confirm-gate 2/2 + pipeline 67/67（新增 E324 用例：批准→递归恢复执行 + chat_reply approve、取消→reject 不执行、无待批「执行」不误吞、confirm+calendar_skill 挂起写 pending(resume) 不执行）；`npm run doc-lint` 0 FAIL 0 WARN。全量 `test:all`/bench 未跑（成本纪律）。

### 后续候选

- **第二刀**：裁决面板批准后自动恢复执行（gateway 侧 resume + UI 执行回执）已随 2026-09-04 收口，见 `docs/2026-09-04-progress-handoff.md`；剩余风险分级与「本次操作预估成本」展示、对话内确认卡、真实 CLI/桌面 e2e 验收仍待后续轮。
- **提交批次**：E318-E324 代码均未提交，待 owner 指示统一提交。
