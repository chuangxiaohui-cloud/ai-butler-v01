# 进度交接 2026-08-22（v0.2b 续作）

> 当前分支：`v0.2b`｜E176 已提交（HEAD=`3c7b67e`）。上一份交接见 `docs/2026-08-21-progress-handoff.md`。

## 今日已收口

1. **表格垂直组标签 3 行+ 支持（E177）**：`scripts/office_image_ocr.py` `detect_merges`
   阶段 B 垂直/角落合并的扫描行数由 `band = min(2, rows)` 独立为 `band_v = min(3, rows)`，
   3 行 L 形表头（`产品` 跨 A1:A3 + `地区` B1:C1）可完整还原；阶段 C 内部空隙分支与
   槽位法分别加守卫（角落合并占住邻居时空锚点不再崩、文本底边越线 2px 不再产生
   pseudo-merge）。
2. **扫描件倾斜纠正 deskew（E178）**：`scripts/office_image_ocr.py` 新增 `deskew_image`
   （HoughLinesP 近水平网格线中位角估计，|角度|≥0.25° 时 warpAffine 白边旋转纠正），
   `--table` 路径先纠偏再做 OCR 与网格线检测；cv2 缺失回退原图不抛错；噪声/模糊/混合/
   旋转（0.8°-1.5° 含 expand）变体下合并结构全部保持，deskew 修复旋转场景。
3. **UI 设置面板集成邮件/日历（E179）**：gateway 新增 `GET/POST /api/mail/credentials`
   （读取不回显授权码）与 `GET /api/calendar/export`（.ics 下载）/ `POST /api/calendar/import`
   （ICS 文本导入）；`calendar-skill` 抽出可复用 `openCalendarDb`/`buildCalendarIcs`/
   `importIcsToDb`（导入导出行为不变，既有 31 条单测原样通过）；UI 原型设置区新增
   “邮件/日历”面板（SMTP 凭据表单、日历导出下载/文件导入）。

## 今日验证

- 全量单测 534/534 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿。
- `doc-lint` 0 FAIL 0 WARN（附录 A 行数预算 950/950 已到上限，压缩 E70 旧条目腾行）。
- office-daily 新增 2 条真跑：3 行 L 形 → xlsx `A1:A3`+`B1:C1`“已还原 2 处”；1.5° 旋转
  组合表头 → deskew 后 `A1:D1`+`A2:B2`+`C2:D2`“已还原 3 处”。
- gateway 新增 2 条单测：邮件凭据读写且不暴露密码（GET 无 `pass` 字段）、日历导入 ICS
  后导出包含 `SUMMARY:网关导入测试`。
- UI 原型 `npm --prefix ui/prototype run build` 通过。
- 已知边界：部分噪声/模糊图 OCR 文本有误读（如“上海”→“奥”），但合并判断不受影响；
  更复杂扫描件（折痕/透字）留待真实样本迭代。

## 今日收尾状态

- 已提交：E176（HEAD=`3c7b67e`）。
- 待提交：E177/E178/E179 全部改动 + 计划文档（`2026-08-22-table-robustness.md`、
  `2026-08-22-ui-mail-calendar.md`）+ 本交接。建议提交信息：
  `E177/E178/E179：表格垂直组标签+倾斜纠正+UI邮件日历`。
- 提交前请勿包含根目录 `.codex-*.cjs`、`data/` 临时文件（已清理 `data/.tmp-*`）。

## 明天继续（按优先级）

1. 真实扫描件样本收口 deskew 鲁棒性（折痕/透字/彩色底），必要时扩展网格线检测。
2. UI 邮件发送入口（对话 `/api/ask` 已具备，可加独立发信面板）。
3. 附录 A 行数预算继续按需压缩旧条目（950/950 无余量）。

## 常用命令

```bash
npm run mail:config -- --host <smtp主机> --port <端口> --secure <0|1> --user <账号> --pass <授权码> --from <发件人>
npm run dev -- "发送邮件给 a@b.com，主题：测试，正文：你好"
npm run dev -- "导入 M:\\path\\events.ics"
python scripts/office_image_ocr.py --table <图片> <out.csv>
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
