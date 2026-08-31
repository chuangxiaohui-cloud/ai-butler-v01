# 推进计划：收件箱主题/发件人 RFC 2047 MIME 解码（E293-后）

> 日期：2026-08-31 · 分支：v0.2b · 状态：已完成

## 目标

真实 QQ 收件箱列表里主题/发件人显示名仍是 MIME 编码词（`=?utf-8?B?...?=`），不可读。实现 RFC 2047 编码词解码（B/Q 两种编码），让 `查收件箱` 列表直接显示可读中文主题与发件人。

## 计划

1. `src/mail/imap.ts`：新增 `decodeMimeHeader` 纯函数——匹配 `=\?charset\?[BbQq]\?text\?=`（多段，相邻编码词间空白按 RFC 2047 §6.2 丢弃），B → base64 字节级解码，Q → quoted-printable（`_`→空格、`=XX`→字节），charset 交给 `TextDecoder`（utf-8/gbk/gb18030/gb2312/big5 等），未知字符集回退 utf-8，再失败原样保留；`fetchRecentEmails` 返回前对 `from`/`subject` 应用解码（不破坏地址部分）。
2. 测试：`imap.test.ts` 新增 `decodeMimeHeader` 单测（B/Q/拼接段/未知字符集回退/显示名+地址）+ TLS fake 集成断言（MIME 编码主题/发件人经 fetch 后解码）。
3. 验证：`npm run build` + imap / office-daily 单测全绿。

**验收标准**

- `查收件箱` 列表主题/发件人显示为可读中文，不再输出 `=?utf-8?B?...?=`
- 无编码词的头部原样返回；拼接编码词正确合并；未知字符集不抛错
- `npm run build` 绿；相关单测全绿

## 执行过程

### 改动

1. `src/mail/imap.ts`：新增 `decodeQuotedPrintable`（Q 编码字节解码）与 `decodeMimeHeader`（RFC 2047，B/Q、多段合并、TextDecoder 字符集 + utf-8 回退）；`fetchRecentEmails` 对 `from`/`subject` 应用 `decodeMimeHeader`。
2. `src/mail/imap.test.ts`：新增 `decodeMimeHeader` 单测 8 断言 + TLS fake 集成用例（MIME 主题/发件人解码）。

### 遇到的问题

无。真实样本（`=?utf-8?B?5rWL6K+V5Li76aKY?=` → 测试主题；`=?gb2312?B?wLTX1HFxLmNvbbXEzcvQxQ==?=` → 来自qq.com的退信；拼接段 `W0FdIGFiYw==` + `ZGVm` → `[A] abcdef`）在 Node `TextDecoder` 下直接通过；`gb2312` 为 WHATWG gbk 别名，无需映射。

## 结果

- 验证：`npm run build` 绿；imap.test.js 10/10、office-daily 66/67（1 skip）全绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 测试：`decodeMimeHeader` 单测 8 断言（utf-8/gb2312 B 编码、Q 编码、拼接段、无编码词、显示名+地址、未知字符集回退）+ TLS fake 集成 1 条。
- 提交：本次未提交（待 owner 决定是否随 v0.2b 收尾一并提交）
- 遗留事项：正文 base64 解码 / HTML 清洗、附件下载、搜信、多账号仍为 v2.6+ 候选
