# 推进计划：PaddleOCR 精度对比

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

在同一扫描件样本上对比 RapidOCR 与 PaddleOCR 的识别质量、耗时与关键词命中，为 `scripts/pdf_text.py` 选择默认 OCR 引擎提供数据。

## 计划

1. 创建本计划文档。
2. 安装 `paddlepaddle` + `paddleocr` 到 Hermes venv。
3. `pdf_text.py` 支持 `PDF_OCR_ENGINE=rapid|paddle`，缓存键带引擎前缀。
4. 用现有扫描件样本跑双引擎基准，记录字符数/耗时/关键词命中（TPS5430、5.5V、500kHz）。
5. 补/改单测，跑 build/test/doc-lint。
6. 更新计划、交接、v2.5 附录 A（E97），提交推送。

**验收标准**

- 两个引擎都能识别样本并输出可读文本。
- 给出明确的精度/耗时对比结论与默认引擎建议。

## 执行过程

- 安装 `paddlepaddle 3.3.1` + `paddleocr 3.7.0`（Hermes venv）。
- `scripts/pdf_text.py` 支持 `PDF_OCR_ENGINE=rapid|paddle`，缓存键带引擎前缀，Paddle 初始化时关闭默认 MKLDNN（PaddleX 的 `PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT=False`），规避 PP-OCRv6 在 oneDNN 下的 `ConvertPirAttribute2RuntimeAttribute` 报错。
- 新增 `scripts/ocr_benchmark.py` 与 `npm run ocr:benchmark`，用临时缓存目录做双引擎冷启动对比。

## 结果

- 样本：`data/datasheets/tps5430-scan-test.pdf` 第 1 页。
- RapidOCR：17.16s，1299 字符，命中 `TPS5430 / 5.5V / 500kHz`。
- PaddleOCR：117.74s，1224 字符，命中 `TPS5430 / 5.5V / 500kHz`。
- 结论：两者关键词全部命中；PaddleOCR 文本结构更完整但慢约 6.9 倍，默认引擎保持 RapidOCR；需要更高质量时可用 `PDF_OCR_ENGINE=paddle`。
- 回归：`npm run build` 通过，`npm run test:all` 260/260 + 17/17 全绿，doc-lint 0 FAIL / 0 WARN。
