# 进度交接 2026-08-21（v0.2b 续作）

> 当前分支：`v0.2b`｜待提交：E169（E160-E168 与 ADR-0002 已提交）。上一份交接见 `docs/2026-08-20-progress-handoff.md`。

## 今日已收口

1. **图片表格结构识别（E168）**：`scripts/office_image_ocr.py` 新增 `--table <img> [out-csv]`
   模式——OCR 结果带坐标框，按 cy 聚类成行、按 cx 聚类成列重建网格并导出 CSV，
   JSON 返回 `{ok,csv,rows,cols}`；`office-daily` 新增 `table_ocr` 模式（“识别/提取表格、
   表格转 CSV、图片表格”关键词，优先于考勤表模板路由），CSV 落盘带“N 行 × M 列”预览，
   引擎不可用诚实提示；真跑 2×2 网格图重建 `A1,B1/A2,B2`（2 行 × 2 列）；单测新增 2 条。
2. **真实日历/邮件服务接入评估（ADR-0002）**：方向决策文档（无代码改动）——日历采用
   “本地 SQLite 权威 + 阶段 1 `.ics` 导出/导入 + 阶段 2 CalDAV 可选 + 阶段 3 云 API 暂缓”；
   邮件采用“草稿（E162 现有）+ 阶段 1 SMTP/TLS 发送（显式用户确认，凭据本地存 `data/`）”；
   明确安全边界：不静默发信/上传、外部服务全部走适配层。
3. **日历 `.ics` 导出（E169）**：`calendar-skill` 本地查询分支支持“导出/下载/保存日历到 .ics 文件”——
   意图层新增“日历/日程导出”query 特判（命中 R004 → calendar_skill，不再偏到 web_search），
   按 `calendar_events` 生成 `BEGIN:VCALENDAR` + 每条 `VEVENT`（每天/每周 → `RRULE:FREQ=DAILY/WEEKLY`，
   含 `UID`/`DTSTAMP`/`SUMMARY`），落盘 `data/office/日历-<ts>.ics`，空日程诚实提示。

## 今日验证

- 全量单测 495/495 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿。
- `doc-lint` 0 FAIL 0 WARN。
- 真跑验证：2×2 网格图 → CSV `A1,B1/A2,B2`（2 行 × 2 列）。

## 今日收尾状态

- 当前待提交：E169（E168 与 ADR-0002 已提交）。
- 相关计划：`docs/plans/2026-08-21-image-table-ocr.md`（E168）、`docs/plans/2026-08-21-calendar-ics-export.md`（E169）。

## 明天继续（按优先级）

1. 统一确认并提交 E169 批次。
2. 继续补齐生活助手能力：邮件 SMTP 发送落地（按 ADR-0002 阶段 1）、`.ics` 导入、
   UI 集成新能力、表格识别增强（复杂表头/合并单元格）。

## 常用命令

```bash
python scripts/office_image_ocr.py --table <图片> <out.csv>
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
