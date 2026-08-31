# 进度交接 2026-08-31（收邮件 E293 实现并并入 v0.2b）

> 当前分支：v0.2b｜本轮收口：收邮件（IMAP 只读收件箱）实现 + 验证 + 提交 `b18174c`。
> 上一份交接见 `docs/2026-08-30-progress-handoff.md`（v2.5 交付封版 + T+6/v2.6/6mo 规划）。

## 今日完成

### 1. 收邮件 E293 实现（owner 指令 2026-08-31「收邮件也一起实现」）

- **代码**：
  - `src/mail/imap.ts`（新）：最小只读 IMAP 客户端（node:net/node:tls，无外部依赖）——`fetchRecentEmails` 查最近 N 封（最新在前 + 未读标记）、`fetchEmailText` 读指定封正文（BODY.PEEK[TEXT]<0.N> 协议级部分抓取，不置已读）、`extractPlainText`（text/plain 直返 / multipart 取首部件）、`resolveImapConfig`（smtp.xxx→imap.xxx 推导，默认 993 TLS，可 imapHost/imapPort/imapSecure 覆盖）；Buffer 字节级解析 `{n}` 字面量（中文不错位）；明文无 STARTTLS 拒绝 LOGIN（H4）。
  - `src/mail/credentials.ts`：`SmtpCredentials` 增可选 `imapHost/imapPort/imapSecure`，load/save 透传。
  - `src/skills/office-daily/index.ts`：email 模式新增收件分支（收件箱/收邮件/查邮件/未读邮件/读第 N 封）；无凭据/空收件箱/失败诚实提示；正文按 §10.5 untrusted_data 分隔符包裹（防注入）；`modeFrom` 补收件关键词；`createOfficeDailySkill` 增 `imapOptions` 测试注入。
  - `src/agent/intent-feature.ts`：office_daily 特征正则补收件关键词（查收件箱/读第 N 封 → office-daily 直连）。
- **验证**：`npm run build` 绿；新增单测 14 条（imap 8 + office-daily 收件 4 + router-v2 2）全绿；office-daily 全文件 161/162（1 skip）；router-v2+credentials+smtp 97/97；`npm run test:all` 退出码 0（集成 32/32）；`npm run doc-lint` 0 FAIL 0 WARN。
- **owner 拍板（2026-08-31）**：① 并入 v0.2b（提交 `b18174c`，11 文件）；② `npm run mail:config` 不扩展收件参数（QQ 默认推导 imap.qq.com + 993 TLS 够用）。
- **文档**：`docs/plans/2026-08-31-email-imap-receive.md`；附录 A E293；`docs/roadmap.md`（E293 + E293-后 MIME/附件/搜信/多账号 v2.6+ 候选）；本交接。

### 2. 真实收件/发信冒烟核对（2026-08-31 收尾，owner 实测 + 核对）

- **收件（E293）**：`npm run dev -- "查收件箱"` 连通真实 QQ IMAP，返回最近 10 封（未读/已读、发件人、主题、日期，最新在前），`mode: life`、`gate_triggered: none`；`读第 1 封` 返回正文且按 §10.5 包 untrusted_data 分隔符，未置已读（BODY.PEEK）。
- **后续修复（owner 拍板 2026-08-31，`docs/plans/2026-08-31-email-body-readable.md`）**：正文可读性——`extractPlainText` 重写为 MIME 正文→可读文本：multipart 按 boundary 拆部件、优先 text/plain；base64/quoted-printable 按 charset 解码（utf-8 出替换符回退 gbk）；text/html 走 `htmlToText`（去 script/style、块级换行、实体解码）；`finalizeBodyText` 收尾：还原正文自带的 `[url](url)` 链接 + URL 前冒号补空格；单部件无消息头时启发式识别 HTML/base64。真实 QQ 安全中心 HTML 邮件清洗为可读文本、elecfans 兜底邮件输出纯 URL（`emails: http://...` 带空格）；单测 +10（`htmlToText` 3 + `extractPlainText` 7），imap 18/18、office-daily 66/67 全绿。
- **缺陷已修复（owner 拍板 2026-08-31，`docs/plans/2026-08-31-email-imap-read-seq-fix.md`）**：「读第 N 封」序号错位——原实现列表显示 IMAP `seq`、`extractReadSeq` 直接把 N 当 seq 取，「读第 1 封」实际读到最老一封（2020 QQ 安全中心邮件）而非最新；已改为列表按位次编号 1..N、读信先按位次定位真实 seq；单测 +2（读第 2 封按位次 / 读第 99 封诚实提示）。
- **发信（E170+E291 双闸实测）**：两步流程（草稿回执 → `确认发送`）真实 SMTP 投递成功：`104735796@qq.com` → `scutcxv138@outlook.com`，主题「AI-Butler 测试邮件」，收件端已确认收到。
- **后续修复（owner 拍板 2026-08-31，`docs/plans/2026-08-31-email-imap-recent-by-date.md`）**：QQ IMAP 的 seq 不按时间顺序（INTERNALDATE 证实 2019-2022 老邮件 seq 2248-2984 大于 8/31 上午邮件 2247，授权码昨日重建后触发重排），「最后 N 个 seq」≠「最近 N 封」；`fetchRecentEmails` 改为 `SEARCH SINCE` 逐档放宽取候选 + 本地按 Date 排序；真实冒烟通过（列表按日期、`读第 1 封`=最新一封）。
- **后续修复（owner 拍板 2026-08-31，`docs/plans/2026-08-31-email-mime-header-decode.md`）**：主题/发件人显示名 RFC 2047 MIME 解码——`decodeMimeHeader`（B/Q、相邻编码词合并、TextDecoder 字符集 + utf-8 回退），`fetchRecentEmails` 返回前应用；真实样本（utf-8/gb2312 B、Q、拼接段）验证通过；单测 +9（`decodeMimeHeader` 8 断言 + TLS fake 集成 1 条），imap 10/10、office-daily 66/67 全绿。

## 工作区遗留（未提交，非本次 E293 范围）

### 3. v2.6 B1~B4 安全治理（E294~E297，owner 指令 2026-08-31「按 B1~B4 安全治理」）

- **B1 写盘沙箱（E294）**：`src/security/sandbox.ts` 新增 Skill 应用数据目录二级白名单 `isSkillOutputAllowed`（`data/{office,learned-videos,boms,calendar}`）+ `guardSkillOutputPath` 门禁（显式注入 outDir 的测试/受信调用方跳过，生产默认路径必须过白名单 + 审计日志）；`calendar-skill` / `schematic-bom` / `office-daily` / `video-learner` 四处写盘点接入。sandbox 单测 +5；office-daily 118/119（1 skip）等全绿。
- **B2 video-learner 域白名单（E295）**：`videoLearnAllowedHosts()`（`VIDEO_LEARN_ALLOWED_HOSTS` env 追加，默认 bilibili/bilivideo/hdslb 域）+ `isVideoLearnUrlAllowed()`（http(s)+子域）；B站响应 untrusted 字幕/媒体 URL 下载前校验，透传 session `allowedHosts`。单测 +2；既有 B站兜底 fixture 改真实 B站域名。
- **B3 installer 安装日志（E296）**：`MarketInstallRecord` 增 `manifestSnapshot`，`confirmAndPersist` 落盘快照。installer 单测 +1 断言。
- **B4 browser-session 域名白名单（E297）**：`fetchPage`/`downloadFile` 增可选 `allowedHosts`（`isDomainMatch` 含子域），缺省保持 E292 SSRF-only；`BrowserFetcher` 接口同步。session 单测 +3。
- **验证**：`npm run build` 绿；相关单测全绿；全量单测与 doc-lint 见当日收尾（文档按 `docs/plans/2026-08-31-v26-b1-b4-security.md` 落地）。
- **文档**：`docs/plans/2026-08-31-v26-b1-b4-security.md`；附录 A E294~E297；`docs/roadmap.md` B1~B4 改已完成并链接。

- `docs/2026-08-30-progress-handoff.md` §11（v2.5 封版后 owner 拍板记录，先前遗留未提交）+ 我更新过的 §12 末行（已记录拍板）。
- `bench/classify-metrics.jsonl`（先前遗留）。
- 审计交付相关：`ai-butler-audit-package-v0.2b-audit-2026-08-30.zip`、`docs/audit-t3/v25-audit-closure.md`、`docs/audit-t3/v25-findings-and-remediation.md`、`docs/plans/2026-08-30-v26-pre-ship.md`、`审计交付/`（未跟踪，先前遗留）。

## 明日待办（接续点）

1. ✅ **真实 QQ IMAP 冒烟**：已由 owner 跑 `npm run dev -- "查收件箱"` → `"读第 1 封"` 并核对完毕（结果见今日完成 §2）；「读第 N 封」序号错位缺陷已修复（见 `docs/plans/2026-08-31-email-imap-read-seq-fix.md`）。
2. **E284 缓存复测**：同一仓库二次解读 fetchMs 回落 ~1-2s、答案数据不变（待用户）。
3. **[P-04] 9/2 复测**：`classify:smoke` ≥7/10 启动回退评估（E1 复验门：n≥30 / 超时率≤10% / 准确率≥80% / p95×1.2）。
4. **owner 侧冒烟 4/7 回填**（search / tavily / desktop / 低置信，待 Tavily 额度恢复）。
5. **遗留未提交文件处置**：由 owner 决定是否随当天收尾一并提交（审计 ZIP 打包已有 `审计交付/` 目录）。

**预估成本(¥)**：¥0（本日全部为本地实现 + 离线单测 + 文档 + 真实 IMAP/SMTP 冒烟；无 LLM/API 付费调用）。
