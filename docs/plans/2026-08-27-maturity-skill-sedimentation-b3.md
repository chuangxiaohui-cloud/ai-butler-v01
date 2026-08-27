# 推进计划：成熟度 L2 累积——市场 Skill 沉淀第 3 批（表格 OCR / BOM 对比 / 文档互转，E256）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

继续 Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，把 表格 OCR、BOM 对比、文档互转 固化为可执行
市场 Skill（复用 E254/E255 的 `file-readers.ts` 文件工具底座 + E251 `@input` 输入通道），用户累积
Skill 14→17，登记附录 A E256。

## 计划

1. **新增 python 脚本**：`scripts/office_bom_compare.py`（xlrd/openpyxl 读 xls/xlsx，扫描前 10 行
   定位位号表头与位号列——表头去点去空格归一化匹配 位号/refdes/designator/编号/料号，缺省第 0 列；
   按位号切分键输出 公共/仅A/仅B/变更 四类差异，样例有界）；`scripts/office_docx_read.py`
   （python-docx 纯读 docx 段落+表格，无 COM 依赖）。
2. **扩展 `src/skills/market/file-readers.ts`**：`ocrTable`（office_image_ocr.py --table +
   沙箱 CSV）、`compareBoms`、`convertDocToPdf`（office_docx_to_pdf.py）、`readDocSummary`
   （docx 走 python-docx、doc 走 Word COM）；统一走 `defaultRunPython`。
3. **单测扩展**：`file-readers.test.ts` 新增 8 条（表格 OCR 2 + BOM 对比 2 + 文档转 PDF 2 +
   docx/doc 速读 2），注入 fake run 成败链。
4. **3 个薄 CLI**：`scripts/market-{table-ocr,bom-compare,doc-convert}.ts`（@input 通道；
   table-ocr 输出沙箱 `*-table.csv`；doc-convert 双模——速读触发词走文本摘要，否则转 PDF
   输出沙箱 `*-converted.pdf`）；package.json 增 `market:*` 脚本。
5. **3 个 Skill manifest**：`configs/market-skills/{table-ocr,bom-compare,doc-convert}/manifest.json`
   （command + input:query + 中文触发词）；本地安装（--yes）。
6. **环境补齐**：补装 openpyxl（office_xlsx_read.py 既有依赖，BOM 对比 xlsx 读取需要）；
   `office_docx_to_pdf.py` 增 python-docx+reportlab 文本保真兜底（本机无 Word/WPS COM）。
7. **真实文件验证**：table-ocr（OCRtest.png 裁剪图 → 沙箱 CSV + 行列摘要）、bom-compare
   （365IPC BOM xls vs 改版变体 xlsx → 四类差异）、doc-convert（真实 docx → PDF，fitz 复核页数）。
8. **文档**：附录 A 登记 E256；计划文档补结果；handoff 追加。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 14→17。
- 3 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + 集成全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `scripts/office_bom_compare.py`（新）：BOM 对比（位号列自动定位 + 四类差异）。
- `scripts/office_docx_read.py`（新）：docx 纯读（python-docx）。
- `scripts/office_docx_to_pdf.py`（改）：Word COM 优先，不可用时 python-docx+reportlab 文本保真
  兜底（CJK 用 STSong-Light，样式简化，回传 method/warning 诚实降级）。
- `src/skills/market/file-readers.ts`：新增 `ocrTable` / `compareBoms` / `convertDocToPdf` /
  `readDocSummary`。
- `src/skills/market/file-readers.test.ts`：新增 8 条。
- `scripts/market-table-ocr.ts` / `scripts/market-bom-compare.ts` / `scripts/market-doc-convert.ts`（新）。
- `package.json`：新增 `market:table:ocr` / `market:bom:compare` / `market:doc:convert`。
- `configs/market-skills/{table-ocr,bom-compare,doc-convert}/manifest.json`（新）：command +
  input:query + 中文触发词。
- 附录 A 登记 E256。

### 遇到的问题

- **位号列误判**：365IPC BOM 首行是标题、表头在次行且为 `REF.DES.`（带点）→ 改为逐文件扫描前
  10 行 + 表头去点去空格归一化匹配；人脸识别仪 BOM 表头 `编号` 命中同一规则。
- **表格 OCR 超时（P-40 60s）**：整图 OCRtest.png（971×1175）实测 74s，超过 runner 单步超时 →
  冒烟用裁剪图（971×420，27s 完成、31s 全链）；整图超时如实登记为平台边界（P-40）。
- **本机无 Word/WPS COM**：`Word.Application` COM 类不可用（WPS 仅残留目录）→
  `office_docx_to_pdf.py` 增纯 python 兜底；docx 速读改走 python-docx 纯读。
- **openpyxl 缺失**：xlsx 读（office_xlsx_read.py 既有依赖）未装 → 补装 openpyxl（清华源）。

## 结果

- 验证：3 个 Skill 本地安装（--yes）+ `skill:market:run` 全链 ok:true——table-ocr（OCRtest.png
  裁剪 971×420 → 17 行 × 7 列，CSV 落沙箱，31s）、bom-compare（365IPC xls vs 改版变体 xlsx：
  common 12 / 仅A 385 / 变更 1——C1 VALUE 0.1uF/16V→0.22uF/25V）、doc-convert（真实
  AI-Agent-v2.5_2.docx → 11 页 PDF，fitz 复核；速读模式 11822 字符 + 关键词命中）。
- 测试：单测 970/971（1 skip，新增 8 条）+ 集成 32/32；`npm run build` 通过；`doc-lint`
  0 FAIL 0 WARN（C8 49 key）；`maturity:check` 用户累积 Skill 14→17。
- 提交：未提交（等待确认后按单一主题提交）· 推送：待执行（Gitee / GitHub）
- 遗留事项：继续 Phase 1 每周沉淀节奏（下一批候选：GitHub 项目解读细分 / 办公日报模板 /
  日历提醒等）；表格 OCR 整图超过 P-40 上限的优化（如分块识别）留待真实使用反馈。
