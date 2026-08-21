# 推进计划：图片表格识别输出 .xlsx（E172）

> 日期：2026-08-21 · 分支：v0.2b · 状态：已完成

## 目标

E168 图片表格识别目前只输出 CSV；本期直接输出真 .xlsx（Excel 格式），并在 TSR
（Table Structure Recognition）结果里保留 bbox 与 span 原始数据，疑似合并区域
以 warning 如实告知用户；合并单元格还原与复杂表头处理排到下期。

## 计划

1. 依赖：引入 `exceljs`（纯 JS、无原生依赖）。理由：真 .xlsx 是 OOXML+zip 容器，
   零依赖手写不可维护；exceljs 是 Excel 写入事实标准库，社区维护稳定。
2. `scripts/office_image_ocr.py --table`：JSON 输出追加 `grid/cells/spans/warnings`——
   cells/spans 保留每个 OCR 文本块的行列归属与原始 bbox（下期合并还原直接复用，
   避免重跑识别）；启发式检测疑似合并区域（同行跨列 bbox 横向重叠、同列跨行纵向
   重叠、格宽/格高显著大于中位值）输出 warnings。
3. `office-daily` table_ocr 分支：解析新 JSON → exceljs 生成 .xlsx（网格逐行写入）落盘；
   答案带“N 行 × M 列 + 预览 + XLSX 路径”；warnings 非空时如实提示“N 处疑似合并
   单元格（…），已按普通文本逐格填充”；查询词扩展“转成 Excel / 生成表格文件 / xlsx”。
4. 测试：真跑（PIL 2×2 网格 → xlsx 读回 A1,B1/A2,B2）；warning 格式化单测；
   引擎不可用诚实提示保持。
5. 文档：附录 A 登记 E172（压缩一条旧条目腾 1 行）、skills README、handoff、doc-lint。

**验收标准**

- `识别这张表格`（2×2 网格图）→ 生成 .xlsx，exceljs 读回 4 格内容正确。
- TSR JSON 含 cells/spans（带 bbox）；疑似合并返回 warnings 并在答案中如实提示。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。
- 下期：合并单元格还原 + 复杂表头处理，届时复用 spans 数据，再对齐验收标准。

## 执行过程

### 改动

- `scripts/office_image_ocr.py --table`：JSON 输出追加 `grid/cells/spans/warnings`——
  cells/spans 保留每个 OCR 文本块的行列归属与原始 `bbox/score`（下期合并还原直接复用）；
  启发式疑似合并检测（同行跨列 bbox 横向重叠、同列跨行纵向重叠、格宽/格高显著大于
  中位阈值）输出 warnings。
- `office-daily` table_ocr：改由 exceljs 生成真 `.xlsx`（逐行写网格），答案带“N 行 × M 列 +
  预览 + XLSX 路径”；warnings 非空时 `tableWarningsNote` 如实提示“N 处疑似合并单元格…
  已按普通文本逐格填充，请在 Excel 中核对后手动合并”；查询词扩展“转成 Excel /
  生成表格文件 / xlsx”。
- 依赖：`package.json` 新增 `exceljs@^4.4.0`（纯 JS、无原生依赖）。

### 遇到的问题

- 测试补丁锚点误命中“会议邀请邮件草稿”测试（同形 `existsSync(result.path)` 多处出现），
  xlsx 断言错位导致误失败；改为按测试名定位“图片表格识别真跑”后插入，全绿。

## 结果

- 验证：`npm run build`；单测 521/521 + 1 条 fitz 门控跳过 + 集成 17/17；
  `doc-lint` 0 FAIL 0 WARN（附录 950/950，压缩 E61 腾 1 行登记 E172）。
- 真跑：2×2 网格 → xlsx 读回 `A1/B1/A2/B2` 正确、无 warnings 误报；宽表头“月度销量汇总”
  → 答案如实提示“检测到 1 处疑似合并单元格（第1行第2列跨列合并）”，xlsx 正常落盘。
- 测试：新增 1 条单测（warning 文案）+ 真跑 xlsx 读回断言（A1/B2）。
- 提交：待提交 · 推送：待 push:hosts
- 遗留事项：合并单元格还原 + 复杂表头（下期，复用 TSR spans/bbox）；UI 集成；
  附录 A 行数预算持续 950/950。
