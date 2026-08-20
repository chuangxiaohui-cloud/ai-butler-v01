# 推进计划：图片表格结构识别 → CSV（E168）

> 日期：2026-08-21 · 分支：v0.2b · 状态：已完成

## 目标

`office-daily` 支持“识别图片里的表格”：用既有 OCR 引擎输出文本+坐标框，
按坐标聚类重建行列网格，导出 CSV 并落盘；引擎缺失/不可用时诚实提示。

## 计划

1. `scripts/office_image_ocr.py`：新增 `--table <img> [out-csv]` 模式——OCR 结果带坐标框
   （RapidOCR `[box, text, score]`，Paddle 取 rec_boxes/rec_texts），按 cy 聚类成行、
   按 cx 聚类成列，网格单元格输出 CSV；JSON 返回 `{ok, csv, rows, cols, errors}`。
2. `office-daily`：新增 `table_ocr` 模式（在“考勤/模板/表格→table”之前匹配，
   关键词“识别/提取表格、表格转 CSV、图片表格”）；单图链路写临时文件 → `--table` →
   CSV 落盘，结果带“N 行 × M 列”与预览；引擎不可用诚实提示；fallback 能力清单补表格识别。
3. 测试：表格识别引擎不可用诚实提示、图片表格真跑（PIL 画 2×2 网格 → CSV 含 A1/B1/A2/B2），
   HAS_LOCAL_RAPIDOCR 门控。
4. 登记附录 A（E168）、建 `docs/2026-08-21-progress-handoff.md`、更新 skills README；
   跑 build/test/doc-lint。

**验收标准**

- 单测新增 ≥2 条全绿（真跑按环境门控），集成 17/17 不变；doc-lint 0 FAIL 0 WARN；
- 2×2 网格图“识别这张表格”输出 CSV 含 `A1,B1` 与 `A2,B2`，落盘 .csv 存在。

## 执行过程

### 改动

- `scripts/office_image_ocr.py`：新增 `--table` 模式与 `extract_boxes`/`reconstruct_table`
  （列聚类阈值=中位宽×1.2，行聚类阈值=中位高×0.7，行锚点取首项避免均值漂移），
  输出 CSV（csv 模块带引号）与 `{ok,csv,rows,cols}`。
- `src/skills/office-daily/index.ts`：`OfficeMode` 加 `table_ocr`；`modeFrom` 在
  “考勤/模板/表格→table”之前匹配表格识别关键词；新增表格分支：临时文件 → `--table` →
  CSV 落盘，返回 `path/csv/rows/cols`，文案“已识别表格（N 行 × M 列）：…；CSV 已保存”。
- 测试：`office-daily/index.test.ts` +2。

### 遇到的问题

- `modeFrom` 里“表格”已被考勤表模板占用：`table_ocr` 关键词必须排在“考勤/模板/表格”之前，
  并保证“制作表格模板”等仍走考勤表模板。

## 结果

- 验证：`npm run build` 通过；表格识别定向 2/2；office-daily 全文件 36 通过 + 1 条 fitz 门控跳过；
  `npm run test` 493/493 + 1 跳过；`npm run test:integration` 17/17；`doc-lint` 0 FAIL 0 WARN。
- 测试：单测 493/493 + 1 门控跳过 + 集成 17/17
- 提交：待提交（用户手动 git add + commit）
- 遗留事项：复杂表头/合并单元格的表格重建增强、真实日历/邮件服务接入评估、UI 集成新能力。
