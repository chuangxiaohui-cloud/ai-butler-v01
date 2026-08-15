# 推进计划：OCR 缓存清理策略

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

给 `data/ocr-cache/` 增加数量上限，写缓存后自动淘汰最旧文件，避免长期运行堆积磁盘。

## 计划

1. `scripts/pdf_text.py`：新增 `PDF_OCR_CACHE_MAX_FILES`（默认 200），写缓存后按 mtime 淘汰最旧。
2. 用临时缓存目录 + 上限 2 验证：写入新缓存后只保留 2 个文件。
3. 跑 `npm run test:all` 与 doc-lint。
4. 登记 v2.5 附录 A（E90）、更新文档，提交推送。

**验收标准**

- 缓存文件数不超过上限。
- 单测全绿，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- `scripts/pdf_text.py`：新增 `PDF_OCR_CACHE_MAX_FILES`（默认 200），写缓存后按 mtime 自动淘汰最旧文件，避免 `data/ocr-cache/` 长期堆积。

### 遇到的问题

- 无阻塞问题。

## 结果

- 验证：临时缓存目录预置 2 个旧缓存 + 上限 2，OCR 后只保留 2 个文件（新缓存 + 较新旧缓存），最旧被淘汰。
- 测试：单测 255/255 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：`ffba880` · 推送：Gitee / GitHub
- 遗留事项：PaddleOCR 精度对比未做。
