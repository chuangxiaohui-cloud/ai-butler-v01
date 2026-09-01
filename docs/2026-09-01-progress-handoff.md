# 进度交接 2026-09-01（收件链路 E293-后 全链收口：E298/E299 冒烟通过 + 搜信 E300/E301 冒烟通过 + 多账号 E302）

> 当前分支：v0.2b｜本轮收口：收件链路 E293-后 全部收口——附件下载（E298）→ 📎 标记（E299）→ 搜信（E300/E301），真实 QQ 冒烟全部通过。
> 上一份交接见 `docs/2026-08-31-progress-handoff.md`（收邮件 E293 实现 + E298 附件下载实现）。

## 今日完成

### 1. 附件下载 E298 真实冒烟通过（owner 实测 2026-09-01）

- `npm run dev -- "下载第 1 封的附件"` → `已下载收件箱第 1 封的 1 个附件：架构师审计框架说明.md（5025 字节）`，落盘 `data/mail-attachments/`。
- 本地复核：UTF-8 中文 Markdown 内容与原文一致，中文文件名保留；位次定位 → `BODY.PEEK[]` → MIME 解析 → base64 解码 → B1 沙箱门禁全链路 OK。
- 记录：附录 A E298 证据、roadmap E293-后、`docs/plans/2026-08-31-email-imap-attachment-download.md`；提交 `1d29b22`。

### 2. 查收件箱列表附件标记 E299（owner 指令 2026-09-01「方案Ｂ」）

- **代码**：
  - `src/mail/imap.ts`：`ImapMessageSummary` 增 `hasAttachment`；`fetchRecentEmails` 头部 FETCH 后追加 `FETCH N (BODYSTRUCTURE)`，新增 `parseBodyStructureUnits`（按 `* N FETCH` 单元 + 括号深度收集 BODYSTRUCTURE 原文，兼容 literal 片段）与 `bodyStructureHasAttachment`（扫描 `"attachment"` disposition 关键词；inline 图片/正文部件不算）。
  - `src/skills/office-daily/index.ts`：查收件箱列表行尾有附件时追加 `｜📎`。
- **验证**：`npm run build` 绿；新增单测 2 条（imap 1：BODYSTRUCTURE 有/无附件标记；office-daily 1：列表带 📎 且无附件行不标）；imap+sandbox+router-v2 119/119、office-daily 70/71（1 skip 为既有 PDF 用例）；`npm run doc-lint` 0 FAIL 0 WARN。
- **真实冒烟**（owner 实测 2026-09-01）：`npm run dev -- "查收件箱"` → 第 1 封「附件测试」行尾 `｜📎`，无附件邮件不标；E299 收口完成。
- **文档**：`docs/plans/2026-09-01-email-list-attachment-flag.md`；附录 A E299；`docs/roadmap.md` E293-后补「附件标记」。
- **提交**：commit 见 git log。

### 3. 收邮件搜信 E300（owner 指令 2026-09-01「继续推进」）

- **代码**：
  - `src/mail/imap.ts`：新增 `ImapSearchCriteria { subject?, from?, keyword? }` 与 `searchEmails(creds, criteria, options)`——`SEARCH SUBJECT/FROM`（keyword 用 `OR SUBJECT x FROM x`，多条件 AND）走服务器端；非 ASCII 条件（中文 MIME 头服务器 SEARCH 不命中）或服务器零命中时取最近 `searchWindow`（默认 200）封本地 MIME 解码后过滤；抽 `fetchHeaderSummaries` / `fetchAttachmentFlags` / `sortAndSlice` 公共助手，`fetchRecentEmails` 同步复用（📎 只对最终展示条数发 BODYSTRUCTURE）。
  - `src/skills/office-daily/index.ts`：email 模式新增搜信分支（`搜信|搜.*邮件|找.*邮件|查找.*邮件|搜索.*邮件`，置于附件分支后、收件分支前）；`extractSearchCriteria` 提取主题/发件人/通用关键词；列表与查收件箱共用 `formatEmailList`（含 📎）；无关键词/无凭据/无结果诚实提示。
  - `src/agent/intent-feature.ts`：office_daily 特征正则补搜信关键词 → 搜信直连 office-daily。
- **验证**：`npm run build` 绿；新增单测 7 条（imap TLS 2：主题 SEARCH 命令 + 中文本地兜底 / 发件人、通用关键词 + 📎；office-daily 4：搜周报命中同格式 / 找 alice 发件人 / 无结果 / 无关键词引导；router-v2 1：搜周报邮件 → office-daily）；imap+router-v2 109/109、office-daily 74/75（1 skip 为既有 PDF 用例）；`npm run doc-lint` 0 FAIL 0 WARN。
- **文档**：`docs/plans/2026-09-01-email-imap-search.md`；附录 A E300；`docs/roadmap.md` E293-后「搜信」改已完成。
- **真实冒烟**（owner 2026-09-01，已通过）：发件人搜索 `找 scutcxv138@outlook.com发的邮件` → 命中 2 封 + 📎；主题搜索 `搜测试的邮件`/`搜直播的邮件`/`搜 NVIDIA 的邮件` 均命中；`搜周报的邮件` 诚实返回没搜到（E301 修复市场触发词抢占后不再生成 docx）。
- **E301 修复**：`src/search/pipeline.ts` 市场触发命中前按路由决定门槛——路由 decision 为 direct（已直连本地 Skill）时 `minTriggerLength` 提到 3，2 字泛触发词不抢专属意图；≥3 字定向触发词照常覆盖。新增 pipeline 单测 2 条；pipeline+nl-router 64/64；附录 A E301；真实复验通过（2026-09-01）。
- **遗留**：多账号仍为 v2.6+ 候选。
- **提交**：E300 `356d58b`；E301 `3c02d64`；冒烟通过文档 `ab70482`。

### 4. 收邮件多账号 E302（owner 指令 2026-09-01「继续」）——roadmap E293-后 最后一项

- **代码**：
  - `src/mail/credentials.ts`：新增 `CredentialsStore { active, accounts }` 容器——`saveCredentials` 写容器并置 active（`--account` 缺省沿用 active/「default」），`loadCredentials` 返回 active 账号（旧单账号文件读取自动迁移），新增 `loadCredentialsStore` / `setActiveAccount` / `listAccountSummaries`。
  - `scripts/mail-config.ts`：增 `--account <名称>`（保存到指定账号并置 active）/ `--set-active <名称>`（纯切换）/ `--list`（列出账号与 active 标记）。
  - `src/skills/office-daily/index.ts`：email 模式最前新增切账号分支——「切到 xx 邮箱」「用 xx 账号查收件箱」按 key/邮箱定位，未配置诚实提示并列出已有账号；纯切换只回结果，带收/搜/附件/发意图则切换后继续执行；多账号（≥2）时收件/搜信列表标注 active 账号；`modeFrom` 补切账号关键词。
  - `src/agent/intent-feature.ts`：office_daily 特征正则补切账号关键词 → 直连 office-daily。
- **验证**：`npm run build` 绿；新增单测 10 条（credentials 3 / office-daily 4 / router-v2 3）；credentials+router-v2+imap 119/119、office-daily 78/79（1 skip 为既有 PDF 用例）；`npm run test:all` 退出码 0（单测 1197/1198 含 1 skip + 集成 32/32）；doc-lint 0 FAIL 0 WARN。
- **真实冒烟**（owner 2026-09-01）：`切到 outlook 邮箱` 切换成功；`用 qq 邮箱查收件箱` 正常列出 QQ 收件箱 10 封（含 📎）；active=outlook 时 `查收件箱` 被微软拒绝（`NO Basic authentication is disabled.`）——Outlook.com 已停用账号密码基本认证，非代码问题；Outlook 需 OAuth2（XOAUTH2）支持，登记为后续候选。
- **文档**：`docs/plans/2026-09-01-email-multi-account.md`；附录 A E302；`docs/roadmap.md` E293-后「多账号」改已完成——收件链路 E293-后 全链收口。
- **提交**：`f35de2b`。

## 明日待办（接续点）

1. 收件链路 E293-后 已全链收口（收件/读信/附件下载/搜信/多账号）。下一项按 owner 拍板：v2.6 pre-ship 启动门或 v1.0 大章节。

## 后续候选（owner 拍板后启动）

- **Outlook OAuth2（XOAUTH2）**：Outlook.com 已停用 IMAP 账号密码基本认证（实测 `NO Basic authentication is disabled.`）`NO Basic authentication is disabled.`），若要用 Outlook 做第二邮箱需实现 OAuth2 IMAP（Azure 应用注册 + 令牌刷新），登记为候选。`n- **v2.6 pre-ship**：`docs/plans/2026-08-30-v26-pre-ship.md` 有启动门（owner 启动委托 → 开 `v2.6-pre-ship` 分支），scope 已锁定 = v2.6 增量 + B1~B4（已完成）+ P-148~P-150（按需触发）。
- **v1.0 大章节**：MCP 子 Agent、证据链 UI、远程对话通道、代码托管联动等，见 §4.4 里程碑表与 P-10 验收口径。

**预估成本(¥)**：¥0（本日全部为本地实现 + 离线单测 + 文档 + 真实 IMAP 冒烟；无 LLM/API 付费调用）。
