# 推进计划：查收件箱列表附件标记（BODYSTRUCTURE 📎）

> 日期：2026-09-01 · 分支：v0.2b · 状态：完成（E299）
> 关联：`docs/roadmap.md` E293-后（附件下载收尾，方案 B）/ owner 指令 2026-09-01「方案Ｂ」

## 目标

「查收件箱」列表增加附件标记：`fetchRecentEmails` 增 `hasAttachment`（`FETCH ... BODYSTRUCTURE` 判断每封是否含 `Content-Disposition: attachment` 部件，inline 图片不算），office-daily 列表行尾标 `📎`，让用户一眼挑出带附件的邮件再下载。

## 计划

1. `src/mail/imap.ts`：`ImapMessageSummary` 增 `hasAttachment`；`fetchRecentEmails` 头部 FETCH 后追加 `FETCH N (BODYSTRUCTURE)`，新增 `parseBodyStructureUnits`（按 `* N FETCH` 单元 + 括号深度收集 BODYSTRUCTURE 原文，兼容 literal 片段）与 `bodyStructureHasAttachment`（扫描 `"attachment"` disposition 关键词）。
2. `src/skills/office-daily/index.ts`：列表行尾有附件时追加 `｜📎`。
3. 测试：imap / office-daily 假 IMAP 服务器支持 BODYSTRUCTURE 响应（`FakeImapMessage.bodyStructure`），新增「有/无附件标记」断言与「查收件箱列表带 📎」用例。
4. 文档：附录 A E299、roadmap E293-后、当日 handoff。

**验收标准**

- `npm run build` 绿；imap / office-daily 相关单测全绿。
- 查收件箱列表对带附件邮件显示 📎、无附件不显示；真实 QQ 冒烟待用户（成本纪律）。
- doc-lint 0 FAIL 0 WARN。

## 执行过程

### 改动

- 见「计划」。

### 遇到的问题

- 无（BODYSTRUCTURE 为独立 FETCH 命令，与头部 FETCH 分离，避免 literal 污染头部解析；假服务器补 `FakeImapMessage.bodyStructure` 默认无附件结构）。

## 结果

- 验证：`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN（提交前复核）。
- 测试：新增单测 2 条——imap 1（BODYSTRUCTURE 有/无附件标记 + FETCH 命令断言）、office-daily 1（查收件箱列表带 📎 且无附件行不标）；imap+sandbox+router-v2 119/119、office-daily 70/71（1 skip 为既有 PDF 用例）。
- 提交：随当天收尾提交（commit 见 git log）。
- 遗留：真实 QQ 查收件箱 📎 冒烟待用户；搜信 / 多账号仍为 v2.6+ 候选。
