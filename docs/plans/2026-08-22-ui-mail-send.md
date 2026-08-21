# 推进计划：UI 邮件发送入口（E180）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

E179 把 SMTP 凭据配置与日历导入导出接进 UI，但邮件“发送”仍只有对话/CLI 入口。
本期在“邮件”设置面板补发信区块（收件人/主题/正文 + 发送按钮），发送复用
`/api/ask` 同一问答管道，不新增独立发信链路，保持“CLI、gateway、UI 共用同一
pipeline”的稳定契约。

## 计划

1. `ui/prototype/src/App.tsx` `MailSettings` 新增发信区块：
   - 表单：收件人 / 主题 / 正文（textarea）。
   - 发送：拼查询 `发送邮件给 <to>，主题：<subject>，正文：<body>` →
     `POST /api/ask` → 回显 `answer`（office-daily 邮件模式承担缺项提示、
     未配置凭据诚实拦截、SMTP 发送）。
   - 客户端预检：三字段缺一即提示不请求。
2. `ui/prototype/src/styles.css`：`.allowlist-row textarea` 与 `.settings-sep` 样式。
3. 文档：附录 A 登记 E180（压缩 E69 旧条目腾行）、计划文档、handoff、doc-lint。

**验收标准（本次对齐）**

- UI 原型 `npm --prefix ui/prototype run build` 通过。
- 查询格式与既有 E170 单测用例（`发送邮件给 rcpt@example.com，主题：测试，正文：你好`）
  一致，技能层缺项/未配置凭据/真发路径已有测试覆盖。
- 主项目 build + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 结果

- MailSettings 新增发信区块（收件人/主题/正文 + “发送邮件”按钮，发送中禁用防重复提交），
  发送经 `/api/ask`，答案原样回显（“邮件已发送：发件人 … → 收件人 …”或诚实提示）。
- CSS 补齐 textarea 与分隔线样式；UI 原型生产构建通过。
- 文档：附录 A 压缩 E69 旧条目腾 3 行登记 E180；`docs/plans/2026-08-22-ui-mail-send.md`
  与 handoff 已更新。
- 测试：主项目 build；单测 534/534 通过 + 1 条 fitz 门控用例按环境跳过 +
  集成 17/17 全绿；doc-lint 0 FAIL 0 WARN。
- 未做：收件人多地址/附件/草稿编辑等高级发信能力，需求确认后再迭代。
