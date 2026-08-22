# 推进计划：真实扫描件跨页大表拼接——多页表头去重与分页切片对齐（E185）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

承接 E184（复杂表头合并还原）。本期收口真实扫描件的**跨页大表**场景：一份多页 PDF
扫描件中，同一张表被分页切片打印，每页重复表头。目标是按页做表格识别后**拼接为一整张表**——
表头只保留一次，后续页正文行顺序追加；全程复用 TSR 已保留的 bbox/span（逐页 OCR 结果），
不重跑整图识别。

## 计划

1. `scripts/office_image_ocr.py`：
   - 抽出 `process_table_array(engine, arr)`（单页：deskew → 透字抑制 → OCR → 网格重建 →
     detect_merges → 合并重排 → cells/spans），单图路径行为与现有一致。
   - 新增 `render_pdf_pages(src)`：`--table` 输入为 `.pdf` 时用 fitz 按 dpi=200 渲染每页为
     RGB 数组（fitz 缺失时诚实报错）。
   - 新增 `stitch_table_pages(page_dicts)`：跨页拼接——逐后续页求“与首页的最长公共表头前缀
     h”（逐行非空格文本匹配率 ≥70%），h≥1 时去掉该页前 h 行表头、正文行追加，全局行号按
     `total_rows - h` 偏移重排 merges/cells/spans；列数不一致时按首页列数补齐/截断并告警
     `page_col_mismatch`；h=0 无法去重时整页追加并告警 `page_header_mismatch`（诚实降级）。
   - 输出 JSON 新增 `pages` / `page_stitched` / `page_headers` 字段（单图 pages=1 兼容）。
2. `src/skills/office-daily/index.ts` `table_ocr`：文件查找放宽为“图片或 PDF”；结果类型补
   pages/page_stitched；答案文案多页时改为“已识别表格（N 页拼接 X 行 × Y 列）”。
3. 测试：`index.test.ts` 新增 1 条真跑（`HAS_LOCAL_RAPIDOCR && PATH python 有 fitz` 门控）——
   合成 2 页表 PDF（PIL save_all 生成，首页表头+2 行正文、次页重复表头+2 行正文），断言
   xlsx 行数 = 首页表头 + 4 行正文、merges 仅来自首页表头（如 `A1:A2`+`B1:C1`+`D1:E1`）、
   答案含“2 页拼接”与“已还原 3 处”。
4. 文档：附录 A 登记 E185（affects §6,§13 | bench:na(new-param)）、skills README 更新、
   handoff 更新、doc-lint 全绿。

**验收标准**

- 2 页合成表 → xlsx 6 行 × 5 列（表头 2 行 + 正文 4 行），merges 仅首页表头，零 warning，
  答案含“2 页拼接”与“已还原 3 处”。
- 单图路径输出与 E184 完全一致（既有 13 条真跑 merges/答案不变）。
- 列数不一致/表头不一致 → 诚实告警不产出错误结构。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 执行过程

### 改动

- `scripts/office_image_ocr.py`：
  1. 抽出 `process_table_array(engine, arr)`——把原 `--table` 单图链路（deskew → 透字抑制 →
     OCR → 网格重建 → detect_merges → 合并重排 → cells/spans）收进一个函数，单图输出
     `pages=1`，与 E184 行为逐字节一致。
  2. 新增 `render_pdf_pages(src)`：`.pdf` 输入用 fitz 按 `TABLE_PDF_DPI=200` 渲染每页为
     RGB 数组；fitz 缺失时诚实报错提示安装 pymupdf。
  3. 新增 `stitch_table_pages(page_dicts)`：逐后续页求与首页的最长公共表头前缀 h（`_row_similar`
     非空格文本匹配率 ≥70%），h≥1 去重该页表头、正文行追加，merges/cells/spans 按
     `total_rows - h` 全局行号重排；列数不一致按首页列数补齐/截断并告警 `page_col_mismatch`；
     h=0 整页追加并告警 `page_header_mismatch`（诚实降级，不丢数据）。输出 JSON 新增
     `pages` / `page_stitched` / `page_headers`。
- `src/skills/office-daily/index.ts` `table_ocr`：文件查找放宽为图片或 PDF；结果类型补
  `pages`/`page_stitched`；答案文案多页时前缀“N 页拼接”。
- 测试：`index.test.ts` 新增 1 条真跑——PIL `save_all` 合成 2 页表 PDF（首页表头+2 行正文、
  次页重复表头+2 行正文），断言 xlsx 6 行 × 5 列、merges 仅首页表头
  `A1:A2`+`B1:C1`+`D1:E1`、锚点格 `产品`、第 2 页正文行（笔记本/台式）落位正确、答案含
  “2 页拼接”与“已还原 3 处合并单元格”。

### 遇到的问题

- **`suppress_faint_ink` 在 200dpi 渲染页上把网格线打成碎片**：固定 5px 高斯模糊对
  ~5-6px 粗的 AA 线边缘列产生伪“浅墨”判断，binarize 后某列 max_run 从 918 掉到 307，
  `detect_table_lines` 把一条线分裂成两条伪边（如 1362/1365），列数从 5 变 7、合并跨度
  变宽。修复：模糊半径按图像尺寸自适应——min 边 ≤1000px 保持 5px（既有 E181/E183/E184
  测试路径零变化），大图按 `min_side // 100` 放大（200dpi 页 ≈14px），伪边消失、列数与
  合并跨度恢复。已用 t1/t3/小图对照验证单图路径 merges 与 E184/E181 完全一致。
- **`np.frombuffer(pix.samples)` 只读视图排查**：期间一度误判为悬垂内存，实为调试索引方向
  写反（`dark[row]` 当列用）；按列索引后数据稳定，无内存问题。

## 结果

- 验证：2 页合成表 PDF → xlsx 6 行 × 5 列（表头 2 行 + 正文 4 行），merges 仅首页表头
  `A1:A2`+`B1:C1`+`D1:E1`，零 warning，答案含“2 页拼接 6 行 × 5 列”与“已还原 3 处”。
  单图回归：t1/t3（E184）与 420×430 小图（E181）merges 与既有完全一致，零回归。
- 测试：office-daily 新增 1 条真跑（合成 2 页 PDF，xlsx 读回 `model.merges` + 锚点格 +
  第 2 页正文落位 + 答案计数断言）；主项目 build 通过；单测 + 集成全量见交接文档；
  doc-lint 0 FAIL 0 WARN。
- 提交：待提交。
- 遗留事项：跨页表头去重阈值 70% 与 DPI=200 为启发式常量；真实扫描件（带倾斜/透字的 PDF
  扫描页）留待下期以真实样本复核。
