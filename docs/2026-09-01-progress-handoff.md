# 进度交接 2026-09-01（收件链路 E293-后 收口：E298/E299 冒烟通过 + 搜信 E300/E301 冒烟通过）

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

## 明日待办（接续点）

1. **多账号**：仍为 v2.6+ 候选（roadmap E293-后 剩余项）。

## 后续候选（owner 拍板后启动）

- **多账号**：E293-后 唯一剩余项，涉及多账号配置/切换设计（如「切到 xx 邮箱」「按账号查收件箱」），开工前先写计划文档。
- **v2.6 pre-ship**：`docs/plans/2026-08-30-v26-pre-ship.md` 有启动门（owner 启动委托 → 开 `v2.6-pre-ship` 分支），scope 已锁定 = v2.6 增量 + B1~B4（已完成）+ P-148~P-150（按需触发）。
- **v1.0 大章节**：MCP 子 Agent、证据链 UI、远程对话通道、代码托管联动等，见 §4.4 里程碑表与 P-10 验收口径。

**预估成本(¥)**：¥0（本日全部为本地实现 + 离线单测 + 文档 + 真实 IMAP 冒烟；无 LLM/API 付费调用）。
