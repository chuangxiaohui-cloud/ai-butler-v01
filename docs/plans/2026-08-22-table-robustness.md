# 推进计划：表格垂直组标签 3 行+ 支持 + 扫描件倾斜纠正（E177/E178）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

承接 E176（L 形表头还原）。两条已知边界本期收口：①3 行及以上的垂直组标签
（如 `产品` A1:A3）阶段 B 只扫 2 行扫不到；②真实扫描件常带噪声/模糊/轻微倾斜，
网格线检测在倾斜图上失效，合并结构整体丢失。本期扩展垂直扫描行数，并新增 deskew
倾斜纠正，让 `--table` 在扫描件/噪点/旋转图上仍能还原合并结构。

## 计划

1. `scripts/office_image_ocr.py` `detect_merges` 垂直/角落扫描行数扩展（E177）：
   - 阶段 B 专用 `band_v = min(3, rows)`（阶段 A/C 保持 `band = min(2, rows)`）。
   - 阶段 C 内部空隙分支加守卫：`if not cell_items[hr][left] or not cell_items[hr][right]: continue`
     （角落合并占住邻居时空锚点不再崩）。
   - 槽位法加守卫：`if c1 == c0 and r1 == r0: continue`（文本底边越线 2px 不再产生 pseudo-merge）。
2. 新增 `deskew_image(arr)`（E178）：二值化 → HoughLinesP 近水平线段 → 中位角，
   `|angle| < 0.25°` 不纠正，否则 `cv2.warpAffine` 白边旋转；`--table` 路径
   `load_image → deskew → run_ocr → detect_table_lines`；cv2 缺失回退原图不抛错。
3. 测试：office-daily 新增 2 条真跑（3 行 L 形 → `A1:A3`+`B1:C1`；1.5° 旋转组合表头
   → `A1:D1`+`A2:B2`+`C2:D2`，xlsx 读回 `model.merges` 断言，按集合比较）。
4. 文档：附录 A 登记 E177/E178（压缩 E70 旧条目腾行）、skills README、handoff、doc-lint。

**验收标准（本次对齐）**

- 3 行 L 形表头 → xlsx `A1:A3` + `B1:C1` 共 2 处合并，答案“已还原 2 处”。
- 1.5° 旋转组合表头 → deskew 后 `A1:D1`+`A2:B2`+`C2:D2` 共 3 处合并。
- 既有 10 张回归图 merges 输出与 E176 一致；噪声/模糊/混合变体合并结构保持。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 结果

- 阶段 B 垂直/角落扫描行数独立为 `band_v = min(3, rows)`；真跑 3 行 L 形图 →
  `产品` A1:A3 + `地区` B1:C1 ✓；10 张回归图 merges 输出全部与 E176 一致。
- 阶段 C 内部空隙分支与槽位法守卫落地，角落合并占住邻居、文本底边越线 2px 两类
  边界不再崩/不再误并。
- `deskew_image` 接入 `--table` 路径：噪声（σ14）、模糊（r1.6）、混合、旋转
  （0.8°/1.5°，含 expand）变体下合并结构全部保持；deskew 修复旋转场景
  （`A1:D1`+`A2:B2`+`C2:D2` 全中）。cv2 缺失回退原图（表格模式退化为文本聚类路径）。
- 测试：office-daily 新增 2 条真跑；主项目 build；单测 534/534 通过 + 1 条 fitz
  门控用例按环境跳过 + 集成 17/17 全绿；doc-lint 0 FAIL 0 WARN。
- 已知边界：部分噪声/模糊图 OCR 文本有误读（如“上海”→“奥”），但合并判断不受影响；
  更复杂扫描件（折痕/透字）留待真实样本再迭代。
