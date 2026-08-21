# 推进计划：图片表格合并单元格还原 + 复杂表头（E173）

> 日期：2026-08-21 · 分支：v0.2b · 状态：已完成（验证全绿）

## 目标

承接 E172：TSR 已保留 spans/bbox 原始数据与疑似合并 warnings。本期用几何法把这些
合并区域还原为真实合并单元格——输出的 .xlsx 里出现 `mergeCells`（跨列/跨行），
复杂表头（两级表头/分组列头）正确对齐数据列；无法干净还原的疑似区域继续如实提示。

## 计划

1. `scripts/office_image_ocr.py`：新 `detect_merges`（替换 E172 的 detect_merge_warnings）：
   按列/行槽位（相邻列中心/行锚点取中点）计算每个格 bbox 覆盖的列范围与行范围，
   跨度>1 且覆盖区内其它格为空 → 生成 merge `{row,col,rowSpan,colSpan,text}`；
   覆盖区非空或边界重叠不明 → 保留 warning。输出 JSON 新增 `merges`，并把合并区
   文本重排到锚点格（grid/cells 同步，spans 保留原始归属）。
2. `office-daily` table_ocr：按 merges 对 .xlsx 应用 `mergeCells`；答案追加
   “已还原 N 处合并单元格（跨列 X 处、跨行 Y 处）”；warnings 仍如实提示。
3. 测试：真跑三用例（宽表头跨 2 列 → A1:B1 合并、两级复杂表头 → 2 处合并、2×2 网格
   → 无合并）；xlsx 读回断言 `worksheet.model.merges`；merge 文案单测。
4. 文档：附录 A 登记 E173（压缩 E62 腾 1 行）、skills README、handoff、doc-lint。

**验收标准（本次对齐）**

- 宽表头“月度销量汇总”跨 2 列 → xlsx 出现 A1:B1 合并，文本在合并区，答案含“已还原 1 处”。
- 两级表头（华东跨 2 列 + 华北跨 2 列）→ 2 处横向合并，数据行 4 列对齐。
- 2×2 网格 → 无合并、无 warning，行为与 E172 一致。
- 覆盖区有真实内容无法还原 → 保持 warning 如实提示，不强行合并。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 结果

- `scripts/office_image_ocr.py`：`detect_merges` 落地——槽位法（列/行槽位取相邻中心中点）判定
  bbox 跨多槽位且覆盖区为空 → merge；第 0 行空区间启发式（内部按距中点更近锚点、边缘按
  唯一侧锚点且下方确有内容）补齐“华东/华北”式两级表头；covered 集合防重复合并，merges 按
  row/col 排序保证输出稳定；覆盖区有真实内容 → `merged_conflict` warning 不强行合并。
- `office-daily` table_ocr：按 merges 对 xlsx 应用 `sheet.mergeCells`（先写行再合并），答案
  追加“已还原 N 处合并单元格（跨列 X 处、跨行 Y 处）”；warnings 仍如实提示。
- 真跑验证：宽表头“月度销量汇总”→ A1:B1 合并；两级表头（华东/华北各跨 2 列）→ A1:B1 +
  C1:D1 共 2 处；2×2 网格 → 无合并无 warning。
- 验证：`npm run build` 通过；单测 524/524 通过 + 1 条 fitz 门控用例按环境跳过；集成 17/17
  全绿；`doc-lint` 0 FAIL 0 WARN（附录 A 压缩 E62 腾 1 行登记 E173）。
- 未做：跨行合并（rowSpan>1）实图验证与真实边框线检测（当前为几何启发式，覆盖率有限），
  下期按需再迭代。
