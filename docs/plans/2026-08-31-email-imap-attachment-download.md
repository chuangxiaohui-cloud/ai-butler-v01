# 推进计划：收件箱附件下载（IMAP 附件解析 + 落盘）

> 日期：2026-08-31 · 分支：v0.2b · 状态：完成（E298）
> 关联：`docs/roadmap.md` E293-后（附件下载）/ `docs/plans/2026-08-30-v26-pre-ship.md`（v2.6 增量）

## 目标

收件链路补「附件下载」：`读第 N 封` 同一链路上支持「下载附件」/「下载第 N 封的附件」，IMAP `BODY.PEEK[]` 取整封原始邮件 → MIME 递归解析出附件 → 解码（base64/QP）→ 落盘 `data/mail-attachments/`（走 B1 沙箱门禁）。

## 计划

1. `src/mail/imap.ts`：新增 `EmailAttachment` 接口 + `parseAttachments(raw)`（顶层 multipart 边界 + 嵌套递归；`Content-Disposition: attachment` 或有 filename 且非 inline 判定；`filename*=` RFC 2231 / `filename=` / RFC 2047 MIME 词解码）+ `fetchEmailAttachments(creds, seq, options)`（`FETCH N BODY.PEEK[]<0.maxMessageBytes>`，默认上限 10MB，`ImapFetchOptions` 增 `maxMessageBytes`）。
2. `src/skills/office-daily/index.ts`：email 模式新增附件下载分支（「下载/保存 + 附件」意图，`第 N 封` 按位次定位、缺省最新一封）；落盘 `data/mail-attachments/`（`attachmentDir` 测试注入 + B1 `guardSkillOutputPath` 门禁 + `safeName` 文件名清洗）；`modeFrom` 与 `src/agent/intent-feature.ts` office_daily 特征正则补「附件」关键词。
3. `src/security/sandbox.ts`：`SKILL_OUTPUT_DIRS` 增 `data/mail-attachments`。
4. 测试：imap `parseAttachments` 单测（base64 附件 / RFC 2231 / MIME 词 / 嵌套 multipart / 无附件 / inline 图片排除）+ `fetchEmailAttachments` 假服务器集成；office-daily 附件下载（假 TLS IMAP + 落盘 + 沙箱拒绝）；router-v2「下载附件 → office_daily」；sandbox `data/mail-attachments` 放行。

**验收标准**

- `npm run build` 绿；imap / office-daily / router-v2 / sandbox 相关单测全绿。
- 附件正确解码落盘、文件名清洗、越界路径拒绝且不写文件。
- doc-lint 0 FAIL 0 WARN；附录 A 登记 E298；roadmap E293-后 附件下载标完成。

## 执行过程

### 改动

- 见「计划」。

### 遇到的问题

- **JS 正则 `$` 锚点 × 行尾孤立 `\r`**：`parseAttachments` 直接把整封原始邮件按 `\n` 拆分，每行保留尾部 `\r`；顶层最后一个头部行（`Content-Type...\r`）的 `^...$` 匹配失败（ECMAScript LineTerminator 语义，实测 `'abc\r'.match(/^(.*)$/)` 为 null），导致 boundary 解析为空、附件收集全为 0。修复：`parseAttachments` 入口统一 `raw.replace(/\r/g, '')`（新代码，只影响附件解析路径）。
- **附件名不能走 `safeName`**：`safeName` 是内部临时文件清洗（全角/非 ASCII → 下划线），附件名面向用户，中文附件名转下划线会丢信息；改为保留中文与扩展名、仅去路径分隔符/控制字符/首尾点的 `attachmentFileName`。

## 结果

- 验证：`npm run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN（提交前复核）。
- 测试：新增单测 11 条——imap 6（`parseAttachments` 5 + `fetchEmailAttachments` TLS 集成 1）、office-daily 3（下载落盘 + 中文名保留 / 无附件诚实提示 / 附件目录沙箱拒绝）、router-v2 1（下载附件 → office-daily）、sandbox 1（`data/mail-attachments` 放行）；imap 24/24、router-v2 81/81、sandbox 13/13（合并 118/118）、office-daily 69/70（1 skip 为既有 PDF 用例）。
- 提交：随当天收尾提交（commit 见 git log）。
- 遗留事项：搜信 / 多账号仍为 v2.6+ 候选；真实 QQ IMAP 附件下载冒烟已通过（2026-09-01：`下载第 1 封的附件` → 中文名 md 附件解码落盘 `data/mail-attachments/`，5025 字节与原文一致）。
