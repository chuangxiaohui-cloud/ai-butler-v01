# 进度交接 2026-08-22（v0.2b 续作）

> 当前分支：`v0.2b`｜E177/E178/E179/E180/E181/housekeeping/E182/E183/E184 已提交（HEAD=`190acf7`）。上一份交接见 `docs/2026-08-21-progress-handoff.md`。

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

7. **复杂表头合并还原（E183）**：`detect_merges` 三处修复——角落列垂直标签可延伸到
   表身底部（整行标题下“产品 A2:A3”）；`r_top` 扩展遇到 covered 格停止（标题行不再被
   并入或冲突跳过）；相位 C 内部空区间归属改用槽位中心（对称空区间不再因 OCR 偏移误分）；
   1×1 退化候选跳过。验收 3 场景全过：A1:A3+B1:D1、A1:D1+A2:A3、A1:A3+B1:E1+B2:C2+D2:E2。
8. **左上角垂直标签+斜跨/嵌套多层表头（E184）**：`detect_merges` 新增相位 B0——第 1 行
   锚点的垂直组标签向下扩展（左上角标签“产品 A1:A3”，四道守卫防缺值/透字残影/右缘表头列
   误并）；相位 C 排除垂直合并列并放行“全非数字锚点+单格空隙”的嵌套多层行。验收 3 场景
   全过：T1 `A1:A2`+`B1:C1`+`D1:E1`、T2 斜跨阶梯 `A1:A3`+`B1:C1`+`D1:E1`、
   T3 嵌套 4 层 `A1:A3`+`B1:E1`+`F1:G1`+`B2:C2`+`D2:E2`。

## 今日验证

- 全量单测 538/538 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿（E184 收尾复核）。
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
- E182：`extractPageScript` 新增 2 条单测——citations 透传断言（mock 页）、fake-DOM
  去噪断言（nav/footer/广告剔除、块级换行保留、外部链接去重、同页锚点与 pdf 分流）。
- E183：新增 1 条真跑 3 变体（跨行+跨列混合角落/整行标题+垂直标签/3 层表头），
  xlsx 读回 `model.merges` + 锚点格 + 答案计数断言；既有 10 张回归图与 E181 一致。
- E184：新增 1 条真跑 3 变体（左上角标签/斜跨阶梯/嵌套 4 层），xlsx 读回 `model.merges`
  + 锚点格 + 答案计数断言；既有 10 张回归图 + E181/E183 用例 merges 与 E183 一致，零回归。
- 已知边界：部分噪声/模糊图 OCR 文本有误读（如“上海”→“奥”），但合并判断不受影响；
  透字墨色过重（灰度 <90）超出局部对比度阈值时靠相位守卫诚实提示，不产出伪合并。

## 今日收尾状态

- 已提交：E177/E178/E179、E180、E181、housekeeping、E182、E183、E184（HEAD=`190acf7`）。
- 提交前请勿包含根目录 `.codex-*.cjs`（已 gitignore）、`data/` 临时文件与合成样本（已清理）。

## 明天继续（按优先级）
1. 下期迭代：真实扫描件复杂表头继续收口（跨页大表拼接：多页表头重复/分页切片对齐），复用 TSR 保留的 bbox/span，不重跑识别。
2. 附录 A 行数预算按需压缩旧条目（当前 949/950 余 1 行）。

## 常用命令

```bash
npm run mail:config -- --host <smtp主机> --port <端口> --secure <0|1> --user <账号> --pass <授权码> --from <发件人>
npm run dev -- "发送邮件给 a@b.com，主题：测试，正文：你好"
npm run dev -- "导入 M:\\path\\events.ics"
python scripts/office_image_ocr.py --table <图片> <out.csv>
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
