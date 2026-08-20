# 进度交接 2026-08-20（v0.2b 续作）

> 当前分支：`v0.2b`｜未提交：E127-E157 行为修复、文档资产、A/B 与 B 套评测工具
> 等一批改动等待统一确认。上一份交接见 `docs/2026-08-19-progress-handoff.md`。

## 今日已收口

1. **PDF 原理图 BOM 坐标感知 Week 1（E152）**：新增 `scripts/pdf_symbols.py` 与
   `npm run pdf:symbols`，用 PyMuPDF 提取单词坐标并做文本包围盒聚类；
   DM365 主板电源页跑通（721 词 / 70 候选框 / 35 含位号）。
2. **XLS 对照基线**：新增 `scripts/bom_reference.py`（Excel COM 导出）与
   `scripts/bom-compare.ts`（`npm run bom:compare`），对照
   `365IPC_TOTAL_BOM_0307.xls`：MAIN 363 位号、POE 194、LENS 52；
   当前纯文本解析位号召回率 MB 99.7% / PB 100% / LB 100%，
   精度 68.3% / 86.2% / 70.3%，缺位号仅 `C118`，噪声主要来自 DDR 引脚名。
3. **PDF 原理图 BOM 坐标感知 Week 2（E152）**：新增
   `src/skills/schematic-bom/coordinates.ts`，实现最近邻绑定与三层过滤，
   并接入 `schematic-bom` Skill；XLS 对照坐标版指标为
   MB 召回 95.3% / 精度 72.4%，PB 95.4% / 93.0%，LB 92.3% / 90.6%。
4. **PDF 原理图 BOM 坐标感知 Week 3（E152）**：修复跨页坐标混淆，MB 精度提升到
   92.7%；新增 `src/skills/schematic-bom/changes.ts` 处理 `Delete/Add/BOM change
   to/-->` 备注合并；最终 XLS 对照 MB 94.5% / 83.1%，PB 93.8% / 92.9%，
   LB 92.3% / 85.7%。
5. **办公日常老格式原生读取（E153）**：新增 `scripts/office_xls_read.py` 与
   `scripts/office_doc_read.py`，`.xls/.xlsb` 占比分析、`.doc` 排版不再要求另存；
   真跑验证 Excel COM / Word COM 链路成功。
6. **Word/文档转 PDF（E154）**：新增 `scripts/office_docx_to_pdf.py`，
   `office-daily` 支持 `.docx/.doc → PDF`；临时文档真跑转 PDF 成功。
   顺带修复“格式转换”被 `格式` 误判为 Word 排版的模式路由顺序。
7. **生活助手 PDF 合并/加密与图片格式扩展（E155-E157）**：新增
   `scripts/office_pdf_merge.py` / `office_pdf_encrypt.py` /
   `office_image_convert.py`，`office-daily` 支持多 PDF 合并（pypdf）、
   PDF 密码加密（AES-256，识别“密码/口令”或默认 123456）、
   图片格式转换（PNG/JPG/JPEG/WebP/BMP，Pillow）；未接入能力改为诚实提示；
   单测新增 3 条：合并输出 3 页、加密后 pypdf 解密回验 1 页、PNG→JPG 落盘。

## 今日验证

- 全量单测 454/454、集成 17/17 全绿。
- `doc-lint` 0 FAIL 0 WARN。
- 真跑验证：DM365 XLS 对照、`.xls/.xlsb/.doc` 读取、Word→PDF 转换均成功。

## 今日收尾状态

- 所有改动仍未提交，继续留在待统一确认批次。
- 相关计划：`docs/plans/2026-08-19-schematic-bom-coordinate.md`、
  `docs/plans/2026-08-20-legacy-office-formats.md`、
  `docs/plans/2026-08-20-docx-to-pdf.md` 与
  `docs/plans/2026-08-20-office-daily-pdf-image.md`。

## 明天继续（按优先级）

1. 继续补齐生活助手能力：PDF 压缩/体积优化、HEIC 等图片输入扩展。
2. 统一确认并提交当前 E127-E157 批次。

## 常用命令

```bash
npm run pdf:symbols -- dm365_ip_cam_mb_v1_1b.pdf 2
python scripts/bom_reference.py
npm run bom:compare
```
