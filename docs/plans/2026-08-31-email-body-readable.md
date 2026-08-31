# 推进计划：读第 N 封正文可读性——HTML 清洗 + base64/quoted-printable 解码（E293-后）

> 日期：2026-08-31 · 分支：v0.2b · 状态：已完成

## 目标

真实读信发现：HTML-only 邮件「读第 N 封」返回整段 HTML 源码（如 QQ 安全中心邮件），base64 编码的正文/部件返回乱码。让 `extractPlainText` 输出可读文本：multipart 按 boundary 拆部件、优先 text/plain；base64/quoted-printable 按 charset 解码；text/html 清洗为纯文本；单部件无消息头时启发式识别 HTML/base64。

## 计划

1. `src/mail/imap.ts`：重写 `extractPlainText`——新增 `htmlToText`（无依赖清洗：去 script/style、块级标签换行、剥标签、常用+数字实体解码）、`parseMimePartHeader`（Content-Type/charset/boundary/Content-Transfer-Encoding）、`splitByBoundary`、`decodeBytes`（charset 优先，utf-8 出替换符回退 gbk）、`decodeQuotedPrintableBody`（软换行续行、=XX→字节）、`looksLikeHtml/looksLikeBase64` 启发式。
2. 测试：`imap.test.ts` 新增 `htmlToText` 单测 + `extractPlainText` 用例（HTML-only、单部件 base64、multipart base64 优先 text/plain、multipart 仅 html、multipart QP gb2312）。
3. 验证：`npm run build` + imap / office-daily 单测全绿。

**验收标准**

- `读第 N 封` 对 HTML-only 邮件输出可读文本而非 HTML 源码
- base64 / quoted-printable 正文按 charset 正确解码（utf-8/gbk/gb2312）
- multipart 优先取 text/plain；仅 html 时清洗输出
- 原有 text/plain 直返与既有 multipart 行为不回归
- `npm run build` 绿；相关单测全绿

## 执行过程

### 改动

1. `src/mail/imap.ts`：`extractPlainText` 重写为「MIME 正文 → 可读文本」链路：multipart 检测（boundary 行/头部）→ `extractMimeBody` 按 boundary 拆部件、优先 text/plain → `decodeAndRead` 按 Content-Transfer-Encoding 解码（base64/QP→字节→`decodeBytes` charset 解码）→ text/html 走 `htmlToText`；单部件无消息头时启发式 `looksLikeHtml` / `looksLikeBase64`；`finalizeBodyText` 收尾：`cleanMarkdownLinks` 还原正文自带的 markdown 链接（`[url](url)` → `url`，`[label](url)` → `label（url）`）+ URL 前冒号补空格（`emails:http://` → `emails: http://`）。
2. `src/mail/imap.test.ts`：新增 `htmlToText` 单测 3 断言 + `extractPlainText` 用例 7 条（HTML-only、单部件 base64、multipart base64 plain 优先、multipart 仅 html、multipart QP gb2312、markdown 链接还原、URL 前冒号补空格）。

### 遇到的问题

无。BODY[TEXT] 不含消息级 Content-Type，单部件 base64/HTML 需启发式识别（`looksLikeBase64`/`looksLikeHtml`）；multipart 的 boundary 从正文首条 `--xxx` 分隔行提取，无需额外 FETCH 消息头。

## 结果

- 验证：`npm run build` 绿；imap.test.js 18/18、office-daily 66/67（1 skip）全绿；`npm run doc-lint` 0 FAIL 0 WARN；真实抓取最新邮件确认 `emails: http://...` 带空格。
- 测试：`htmlToText` 3 断言 + `extractPlainText` 新增 7 用例（原 3 用例保持通过）。
- 提交：本次未提交（待 owner 决定）
- 遗留事项：附件下载 / 搜信（SEARCH 条件）/ 多账号仍为 v2.6+ 候选
