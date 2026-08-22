# 进度交接 2026-08-22（v0.2b 续作）

> 当前分支：`v0.2b`｜E177-E186 已提交（HEAD=`5b0bd8b`）。上一份交接见 `docs/2026-08-21-progress-handoff.md`。

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

9. **跨页大表拼接（E185）**：`scripts/office_image_ocr.py` `--table` 新增多页 PDF 输入
   （fitz dpi=200 逐页渲染）；`process_table_array` 单页管道 + `stitch_table_pages` 跨页
   拼接——逐后续页求与首页的最长公共表头前缀（非空格文本匹配率 ≥70%），重复表头自动去重、
   正文行顺序追加，merges/cells/spans 按全局行号重排（复用逐页 TSR bbox/span，不重跑整图
   识别）；列数不一致按首页列数补齐/截断并告警 `page_col_mismatch`，表头无法匹配整页追加
   并告警 `page_header_mismatch`（诚实降级不丢数据）；输出 JSON 新增 `pages`/
   `page_stitched`/`page_headers`。`office-daily` `table_ocr` 接受图片或 PDF，答案文案多页
   前缀“N 页拼接”。`suppress_faint_ink` 模糊半径按图像尺寸自适应（min 边 ≤1000px 保持
   5px，大图按 min/100 放大），修复 200dpi 渲染页细网格线碎裂导致的伪列。验收：合成 2 页
   表 PDF → xlsx 6 行 × 5 列、merges 仅首页表头 `A1:A2`+`B1:C1`+`D1:E1`、锚点格与第 2 页
   正文落位断言、答案含“2 页拼接”与“已还原 3 处”；单图 t1/t3（E184）与 420×430 小图
   （E181）回归 merges 完全一致。

10. **跨页拼接鲁棒性——表头匹配加结构证据（E186）**：`scripts/office_image_ocr.py` `_row_similar`
    新增 span 级结构证据——非空格列位置模式相同且 ≥1 个非空格格文本一致时判同（OCR 噪声/透字粘连下
    表头文本变化但列结构不变仍可去重；文本锚点守卫防稀疏正文行误判），文本先归一化再比较；
    `detect_table_lines` 新增 `_merge_near_edges`（相距 ≤5px 的网格线候选边合并，消除 200dpi 渲染页
    透字抑制造成的幻影空行/列）；阶段 C 整行空格（`start==0` 且 `end==cols-1`）跳过，防 `anchor_c`
    越界崩溃。`office-daily` 告警类型新增 `page_header_mismatch`/`page_col_mismatch`，分页对齐告警
    单独成句“检测到 N 处分页对齐问题…已按普通文本逐格填充，请核对后手动调整”。验收：真跑 2 变体——
    第 2 页表头噪声（`2024`→`2O24`）+ 旋转 1.2° + 透字 → 6 行 × 5 列、merges 仅首页表头、零 warning、
    答案含“2 页拼接”；无表头续接页 → 诚实降级（整页追加 + `page_header_mismatch` 告警，不崩溃不丢数据）；
    DPI 150/200/250/300 复核维持 `TABLE_PDF_DPI=200`；单图回归 t1/t3（E184）与 420×430 小图（E181）零回归。

## 今日验证

- 全量单测 540/541 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿、doc-lint 0 FAIL 0 WARN（附录 A 949/950）（E186 收尾复核）。
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
- E185：新增 1 条真跑（合成 2 页表 PDF，PIL save_all），xlsx 读回 `model.merges`
  + 锚点格 + 第 2 页正文落位 + 答案计数断言；单图回归与 E184/E181 一致。
- E184：新增 1 条真跑 3 变体（左上角标签/斜跨阶梯/嵌套 4 层），xlsx 读回 `model.merges`
  + 锚点格 + 答案计数断言；既有 10 张回归图 + E181/E183 用例 merges 与 E183 一致，零回归。
- E186：新增 1 条真跑 2 变体（第 2 页表头噪声 `2024`→`2O24` + 旋转 1.2° + 透字；
  无表头续接页），xlsx 读回 `model.merges` + 零 warning + 诚实告警断言；单图回归
  t1/t3（E184）与 420×430 小图（E181）merges 完全一致，零回归。

- 已知边界：部分噪声/模糊图 OCR 文本有误读（如“上海”→“奥”），但合并判断不受影响；
  透字墨色过重（灰度 <90）超出局部对比度阈值时靠相位守卫诚实提示，不产出伪合并。

## 今日收尾状态

- 已提交：E177-E186（HEAD=`5b0bd8b`），计划与交接均已归档。
- 提交前请勿包含根目录 `.codex-*.cjs`（已 gitignore）、`data/` 临时文件与合成样本（已清理）。

## 明天继续（按优先级）
1. E186 遗留：极端全噪声表头（每个格文本都变）仍走诚实告警；页脚/页码落在表格网格内
   时会被当正文追加，留待真实样本复核。
2. 附录 A 行数预算维持 949/950 余 1 行，后续新增条目按需再压缩旧 details 块。

## 常用命令

```bash
npm run mail:config -- --host <smtp主机> --port <端口> --secure <0|1> --user <账号> --pass <授权码> --from <发件人>
npm run dev -- "发送邮件给 a@b.com，主题：测试，正文：你好"
npm run dev -- "导入 M:\\path\\events.ics"
python scripts/office_image_ocr.py --table <图片> <out.csv>
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
