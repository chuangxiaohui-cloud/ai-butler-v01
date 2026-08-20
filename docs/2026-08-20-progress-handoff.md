# 进度交接 2026-08-20（v0.2b 续作）

> 当前分支：`v0.2b`｜待提交：E166（E160-E165 已提交）。上一份交接见 `docs/2026-08-19-progress-handoff.md`。

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
8. **生活助手 PDF 压缩与图片输入扩展（E158-E159）**：新增
   `scripts/office_pdf_compress.py`，`office-daily` 支持 PDF 压缩/体积优化
   （PyMuPDF 无损优化，缺失回退 pypdf 去重，支持目标 KB 提示）；
   图片输入扩展 HEIC/HEIF（尽力解码链 pillow-heif → imagecodecs → ffmpeg，
   均不可用诚实提示）、AVIF、TIFF；单测新增 3 条：PDF 压缩页数保留、
   AVIF→PNG 落盘、HEIC 无解码器诚实提示。
9. **生活助手图片型 PDF 降采样压缩（E160）**：`office_pdf_compress.py`
   在指定目标体积且无损不足时，用 PyMuPDF 按 120/90/60 DPI 递减重渲染 +
   JPEG 重编码（仅显式 max_kb 且可用 PyMuPDF 时启用），结果带 `render`/
   `dpi` 与“文字不可选择”诚实提示；真跑图片型 PDF 234KB→193KB（DPI 120
   达标 200KB）；新增 1 条 fitz 特性门控单测（无 PyMuPDF 环境自动跳过）。
10. **办公日常/原理图 Python 脚本解除 gitignore 入库（修复）**：.gitignore 原 *.py 规则使 E137-E160 的办公日常、图片、BOM 参考脚本从未入库；现放行 scripts/office_*.py、scripts/compress_image.py、scripts/bom_reference.py、scripts/pdf_symbols.py，14 个 Python 脚本随 E160 批次一并入库。
11. **图片理解输入归一化与扩展识别（E161）**：`multimodal-preprocessor`
    附件按扩展名兜底识别图片（HEIC/HEIF/AVIF/TIFF/WebP/BMP，type 缺失或
    octet-stream 也生效，路由 hasImage 正确触发）；`toDataUrl` 对 VLM 非安全
    格式（AVIF/TIFF/HEIC/HEIF/BMP）用 `scripts/office_image_convert.py` 尽力
    转 PNG（OFFICE_PYTHON → python/python3，15s 超时），解码不可用诚实降级
    原样透传；`image-analysis`/`color-recognition` 的 firstImage 同步扩展名兜底；
    单测新增 7 条（TIFF/AVIF→PNG 真解码、HEIC 降级等）。
12. **日程↔提醒联动与会议邀请邮件草稿（E162）**：`calendar-skill` 创建日程
    自动登记提醒（ReminderStore，默认到点，支持“提前 N 分钟/小时”），查询
    日程显示已设提醒状态；`office-daily` 邮件模式新增会议邀请草稿
    （主题+时间+参会人/地点/议程占位）；单测新增 3 条。
13. **主动提醒管理：列出/取消（E163）**：`ReminderStore` 新增 `cancel(id)`；
    `office-daily` 提醒模式扩展为“设置/列出/取消”闭环（列出待触发提醒，
    支持“第 N 条”编号或内容关键词取消）；单测新增 4 条。
14. **图片 OCR 文字提取（E164）**：新增 `scripts/office_image_ocr.py`（Pillow 解码
    + RapidOCR/PaddleOCR），`office-daily` 新增 `image_ocr` 模式，识别结果摘要
    + 落盘 txt，引擎缺失诚实提示安装命令；单测新增 2 条（含本地真识别）。
15. **重复提醒：每天/每周（E165）**：`ReminderStore` 表加 `repeat` 列（含 ALTER 迁移），
    `add` 支持 repeat 且首次时间已过自动顺延，`dueReminders` 对重复提醒到期触发后顺延
    下一次（离线多日只补发一次防刷屏）；`parseTimeExpression` 支持“周X/下周X/星期X”；
    `office-daily` 提醒创建识别“每天/每日/每周/每星期”并带周期文案，“工作日/每周末/每月”
    等复杂周期诚实提示暂不支持；单测新增 9 条。
16. **重复日程：每天/每周（E166）**：`calendar-skill` 创建日程识别“每天/每日/每周/每星期”
    并落库 `repeat` 列（含 ALTER 迁移），自动登记同周期重复提醒（复用 ReminderStore.repeat），
    查询展示周期；“工作日/每周末/每月”等复杂周期诚实提示；`time-expression` 抽共用助手
    `detectRepeat`/`extractTimeExpressionOrBare`/`parseRepeatQuery`，`office-daily` 改用共用
    助手（行为不变）；单测新增 6 条。

## 今日验证

- 全量单测 488/488 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿。
- `doc-lint` 0 FAIL 0 WARN。
- 真跑验证：DM365 XLS 对照、`.xls/.xlsb/.doc` 读取、Word→PDF 转换均成功。

## 今日收尾状态

- 当前待提交：E166（E160-E165 已提交）。
- 相关计划：`docs/plans/2026-08-19-schematic-bom-coordinate.md`、
  `docs/plans/2026-08-20-legacy-office-formats.md`、
  `docs/plans/2026-08-20-docx-to-pdf.md`、
  `docs/plans/2026-08-20-office-daily-pdf-image.md` 与
  `docs/plans/2026-08-20-office-daily-pdf-compress-heic.md`（含 E160 增量）。
  `docs/plans/2026-08-20-image-input-normalize.md`（E161）。
  `docs/plans/2026-08-20-calendar-reminder-email.md`（E162）。
  `docs/plans/2026-08-20-reminder-manage.md`（E163）。
  `docs/plans/2026-08-20-image-ocr.md`（E164）。
  `docs/plans/2026-08-20-repeat-reminders.md`（E165）。
  `docs/plans/2026-08-20-recurring-calendar.md`（E166）。

## 明天继续（按优先级）

1. 统一确认并提交 E166 批次（E160-E165 已提交，E166 待提交）。
2. 继续补齐生活助手能力：多图批量 OCR/表格结构识别、真实日历/邮件服务接入评估、UI 集成新能力。

## 常用命令

```bash
npm run pdf:symbols -- dm365_ip_cam_mb_v1_1b.pdf 2
python scripts/bom_reference.py
npm run bom:compare
```
