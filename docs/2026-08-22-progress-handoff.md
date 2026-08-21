# 进度交接 2026-08-22（v0.2b 续作）

> 当前分支：`v0.2b`｜E177/E178/E179/E180 已提交（HEAD=`81c3060`）。上一份交接见 `docs/2026-08-21-progress-handoff.md`。

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
4. **UI 邮件发送入口（E180）**：UI 原型“邮件”设置面板新增发信区块（收件人/主题/正文 +
   发送按钮），发送走 `/api/ask` 同一问答管道——面板拼“发送邮件给 …，主题：…，正文：…”
   查询，由 office-daily 邮件模式承担缺项/未配置凭据诚实拦截与 SMTP 发送，答案原样回显；
   不新增独立发信链路。

5. **扫描件透字/折痕/彩色底鲁棒性（E181）**：`scripts/office_image_ocr.py` 新增
   `suppress_faint_ink`（局部对比度抑制：高斯模糊 5px 背景差 > 85 的浅墨/透字/水印
   置白，对干净扫描件为空操作），`--table` 路径 deskew 之后、OCR/网格线检测之前调用；
   `detect_merges` 阶段 B 垂直扩展新增截断守卫——上方同列有其它文本且未被 covered
   （正常标题行下的垂直组标签）时不再产出截断伪合并，改追加 `merged_conflict` warning
   如实提示“可能为透字/水印噪声，无法自动还原”，并把相关槽位标 covered 防止水平启发
   式误并。透字墨色过重超出抑制范围时靠守卫诚实降级，不产出错结构。

## 今日验证

- 全量单测 535/535 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿。
- `doc-lint` 0 FAIL 0 WARN（附录 A 行数预算 950/950 已到上限，压缩 E69/E70 旧条目腾行）。
- office-daily 新增 2 条真跑：3 行 L 形 → xlsx `A1:A3`+`B1:C1`“已还原 2 处”；1.5° 旋转
  组合表头 → deskew 后 `A1:D1`+`A2:B2`+`C2:D2`“已还原 3 处”。
- gateway 新增 2 条单测：邮件凭据读写且不暴露密码（GET 无 `pass` 字段）、日历导入 ICS
  后导出包含 `SUMMARY:网关导入测试`。
- UI 邮件发送入口（E180）：MailSettings 新增发信区块，经 `/api/ask` 发送并回显答案；
  查询格式与既有 E170 单测一致；UI 原型生产构建通过。
- office-daily 新增 1 条真跑（合成 4 变体）：彩色底/折痕/透字 160 → `A1:A3`+`B1:C1`
  无 warning“已还原 2 处”；透字 90 → 只剩 `B1:C1` + 1 条 `merged_conflict` warning、
  答案含“无法自动还原”。既有 10 张回归图 merges 与 E177 一致，零回归。
- 已知边界：部分噪声/模糊图 OCR 文本有误读（如“上海”→“奥”），但合并判断不受影响；
  透字墨色过重（灰度 <90）超出局部对比度阈值时靠相位守卫诚实提示，不产出伪合并。

## 今日收尾状态

- 已提交：E177/E178/E179（HEAD=`6d93525`）、E180（HEAD=`81c3060`）。
- 待提交：E181 全部改动（`scripts/office_image_ocr.py`、`src/skills/office-daily/index.test.ts`、
  附录 A E181、`docs/plans/2026-08-22-scan-robustness.md`、`src/skills/README.md`、本交接更新）。
  建议提交信息：`E181：扫描件透字抑制+虚假合并诚实提示`。
- 提交前请勿包含根目录 `.codex-*.cjs`、`data/` 临时文件（已清理 `data/.tmp-*`）。

## 明天继续（按优先级）

1. 下期迭代合并单元格还原 + 复杂表头处理：直接复用 TSR 输出保留的 bbox/span 原始数据，
   不再重跑识别；对齐验收标准。
2. 真实扫描件样本（折痕/透字/彩色底）继续收口，必要时扩展网格线检测与抑制阈值。
3. 附录 A 行数预算继续按需压缩旧条目（当前 949/950 余 1 行）。

## 常用命令

```bash
npm run mail:config -- --host <smtp主机> --port <端口> --secure <0|1> --user <账号> --pass <授权码> --from <发件人>
npm run dev -- "发送邮件给 a@b.com，主题：测试，正文：你好"
npm run dev -- "导入 M:\\path\\events.ics"
python scripts/office_image_ocr.py --table <图片> <out.csv>
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
