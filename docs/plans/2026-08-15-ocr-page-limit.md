# 推进计划：扫描件 OCR 页数上限

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

避免多页扫描件 datasheet 触发 OCR 导致二次取证超时：通过 `PDF_OCR_MAX_PAGES` 限制单次最多 OCR 页数，并在返回 JSON 中暴露 `ocrMaxPages / ocrSkippedPages`。

## 计划

1. `scripts/pdf_text.py`：增加 `PDF_OCR_MAX_PAGES`（默认 8，`0` 表示关闭 OCR），超过上限的扫描页跳过并计数。
2. `document-parser.ts`：`PdfTextResult` 补 `ocrMaxPages / ocrSkippedPages` 可选字段。
3. 生成 3 页扫描 PDF，用 `PDF_OCR_MAX_PAGES=2` 验证只 OCR 前 2 页。
4. 跑 `npm run test:all` 与 doc-lint。
5. 登记 v2.5 附录 A（E88）、更新文档，提交推送。

**验收标准**

- `PDF_OCR_MAX_PAGES=2` 时 `ocr` 为 2 页、`ocrSkippedPages` 为 1 页。
- 单测全绿，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- `scripts/pdf_text.py`：新增 `PDF_OCR_MAX_PAGES`（默认 8，`0` 表示关闭 OCR），超过上限的扫描页跳过并计为 `ocrSkippedPages`；返回 JSON 增加 `ocrMaxPages / ocrSkippedPages`。
- `document-parser.ts`：`PdfTextResult` 同步补 `ocrMaxPages / ocrSkippedPages` 可选字段。

### 遇到的问题

- 无阻塞问题；验证顺利。

## 结果

- 验证：3 页扫描 PDF + `PDF_OCR_MAX_PAGES=2`，只 OCR 前 2 页，`ocr=true`、`ocrMaxPages=2`、`ocrSkippedPages=1`、`textPages=2`。
- 测试：单测 255/255 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：<hash> · 推送：Gitee / GitHub
- 遗留事项：单页 OCR 缓存（按页图哈希）未做；PaddleOCR 精度对比未做。
