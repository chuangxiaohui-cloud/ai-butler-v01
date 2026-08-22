# 推进计划：表格识别页脚/页码过滤（E199）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

承接 E186 遗留：页脚/页码落在表格网格内时被 OCR 当正文追加。用户提供真实样本
`OCRtest.png`（971×1175 截图）复现——`第1页，共1页` 被归入末行第 7 列，混入表格数据。
本期：识别并排除页脚页码（强模式 + 底部位置），如实透出告警，不误伤表格正文。

## 计划

1. `scripts/office_image_ocr.py`：
   - 新增 `_PAGE_FOOTER_RE`（`第X页，共Y页`）与 `_filter_page_footer(items, img_height)`
     ——**图片底部 10% 且命中强模式**同时满足才剔除；无模式页脚（公司名/地址等）
     如实保留，避免误伤贴底表格数据。
   - `process_table_array` 在网格归属前过滤页码，removed 转 `page_footer` warning；
     `stitch_table_pages` 把后续页的 page_footer warning 并入总 warning（跨页透出）。
2. `src/skills/office-daily/index.ts`：`TableMergeWarning` 增加 `page_footer` 类型，
   `tableWarningsNote` 增加「已自动排除，不计入表格内容」文案。
3. 测试：`index.test.ts` 新增真跑——合成网格表 PNG，页脚「第1页，共1页」位于表格
   最后一行（贴近底部），断言 csv 不含页码、warning 含 page_footer、答案提示页脚页码。

## 执行过程

- 复现：`python scripts/office_image_ocr.py --table OCRtest.png` → `第1页，共1页`
  （bbox y=1110/1175=94.6%）归入 `row 53, col 6`。
- 修复后：csv 末行 col 6 为空、spans 无页码、warnings 含
  `{"type": "page_footer", "detail": "已排除页脚页码：第1页，共1页"}`，54 行 × 7 列结构不变。
- 中途 bug：warning 追加块被误插入 `stitch_table_pages`（同名 return 锚点匹配两处），
  导致跨页路径 `NameError: footer_removed`；删除误插块并在 stitch 中显式合并后续页
  page_footer warning。

## 结果

- 验证：OCRtest.png 真实样本修复（页码排除、结构不变）；合成页脚样本真跑通过
  （csv 无「第1页」、warning 含 page_footer、答案含「页脚页码」）；E185/E186 跨页
  回归通过（6×5 去重正确）；office-daily 全量 59/59 通过 + 1 条环境门控跳过；
  build 通过。
- 遗留：页脚的其他形态（公司名/地址/纯数字页码）无强模式，暂不处理，仍按正文
  保留——等真实样本反馈再扩展。
- 提交：见附录 A E199 与 handoff。