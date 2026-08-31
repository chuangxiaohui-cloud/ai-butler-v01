# 进度交接 2026-09-01（查收件箱附件标记 E299 + E298 真实冒烟收尾）

> 当前分支：v0.2b｜本轮收口：收件链路「附件下载」收尾——真实 QQ IMAP 冒烟通过（E298）+ 查收件箱列表 📎 附件标记（E299）。
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

## 明日待办（接续点）

1. **搜信（SEARCH 条件）/ 多账号**：仍为 v2.6+ 候选（roadmap E293-后 剩余项）。

**预估成本(¥)**：¥0（本日全部为本地实现 + 离线单测 + 文档 + 真实 IMAP 冒烟；无 LLM/API 付费调用）。
