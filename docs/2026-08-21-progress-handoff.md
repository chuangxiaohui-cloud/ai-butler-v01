# 进度交接 2026-08-21（v0.2b 续作）

> 当前分支：`v0.2b`｜E173 已提交（HEAD=`710c1a2`），E174 进行中。上一份交接见 `docs/2026-08-20-progress-handoff.md`。

## 今日已收口

1. **图片表格结构识别（E168）**：`scripts/office_image_ocr.py` 新增 `--table <img> [out-csv]`
   模式；`office-daily` 新增 `table_ocr` 模式（识别/提取表格、表格转 CSV、图片表格关键词），
   CSV 落盘带“N 行 × M 列”预览，引擎不可用诚实提示；真跑 2×2 网格图重建 `A1,B1/A2,B2`。
2. **真实日历/邮件服务接入评估（ADR-0002）**：日历“本地 SQLite 权威 + 阶段 1 `.ics` 导入导出 +
   阶段 2 CalDAV 可选 + 阶段 3 云 API 暂缓”；邮件“草稿 + 阶段 1 SMTP/TLS 发送（显式确认，
   凭据存 `data/`）”；不静默发信/上传，外部服务走适配层。
3. **日历 `.ics` 导出（E169）**：`calendar-skill` 支持“导出/下载/保存日历到 .ics 文件”
   （每天/每周 → `RRULE:FREQ=DAILY/WEEKLY`，含 `UID`/`DTSTAMP`/`SUMMARY`），意图层导出特判
   命中 R004 不再偏到 web_search。
4. **邮件 SMTP 发送（E170）**：新增 `src/mail/` 适配层（node:net/node:tls 最小 SMTP 客户端，
   465 TLS 直连 / 587 STARTTLS，AUTH LOGIN，正文 base64 UTF-8，错误不含密码）+ `credentials.ts`
   （`data/mail/mail-credentials.json`）+ `npm run mail:config`；`office-daily` 邮件模式新增显式
   “发送/发出去/发给”SMTP 发送流程（缺项诚实提示，未配置凭据不发送），草稿落盘
   `latest-draft.json` 支持“把刚才那封发出去”两段式；意图层发邮件路由到 office_daily
   （发消息/发微信仍走 im_dispatch）。
5. **日历 `.ics` 导入（E171）**：`calendar-skill` 新增 `parseIcs`（RFC 5545 折叠行/UTC/本地/全天/
   转义反转义/多 VEVENT）与导入分支——附件 `.ics` 或查询显式路径读取 → RRULE 映射
   daily/weekly，MONTHLY 等复杂周期跳过并诚实计数，按标题+时间去重写入 `calendar_events`；
   空文件/无 VEVENT/无附件诚实提示，导入不自动批量登记提醒；意图层“导入日历/日程/ics”特判
   命中 R004，`DOMAIN_RE schedule` 增加 `\.ics`。
6. **图片表格识别输出 .xlsx（E172）**：`scripts/office_image_ocr.py --table` 输出扩展 TSR
   原始数据——JSON 新增 `grid/cells/spans/warnings`（cells/spans 保留每个 OCR 文本块的
   行列归属与原始 bbox/score，下期合并单元格还原直接复用）；启发式检测疑似合并区域
   （同行跨列/同列跨行 bbox 重叠、格宽/格高显著大于中位）输出 warnings；`office-daily`
   table_ocr 改用 exceljs 生成真 .xlsx（新增依赖 exceljs），答案带“N 行 × M 列 + 预览 +
   XLSX 路径”，warnings 非空如实提示“N 处疑似合并单元格…请核对后手动合并”；查询词
   扩展“转成 Excel / 生成表格文件 / xlsx”；附录 A 压缩 E61 旧条目腾 1 行登记 E172。
7. **图片表格合并单元格还原（E173）**：`scripts/office_image_ocr.py` 新增 `detect_merges`——
   槽位法（列/行槽位取相邻中心中点）判定 bbox 跨多槽位且覆盖区为空 → merge；第 0 行空区间
   启发式补齐两级表头（华东/华北各跨 2 列），内部并入距中点更近锚点、边缘并入唯一侧锚点且
   下方确有内容；覆盖区有真实内容 → `merged_conflict` warning 不强行合并；merges 按 row/col
   排序保证 xlsx 顺序稳定；`office-daily` table_ocr 对每个 merge 应用 `sheet.mergeCells`
   还原真实合并单元格，答案追加“已还原 N 处合并单元格（跨列 X 处、跨行 Y 处）”；附录 A 压缩
   E62 旧条目腾 1 行登记 E173。
8. **表格网格线检测 + 跨行合并还原（E174）**：`scripts/office_image_ocr.py` 新增
   `detect_table_lines`（暗像素占比 + 最大连续暗 run 双条件检线）与 `reconstruct_grid`
   （网格驱动行列结构）；`--table` 优先网格路径，无网格（无边框）表格回退文本聚类；
   跨行合并实图验证（“部门”跨两行 → xlsx A1:A2 合并、grid 3×2），既有 3 用例回归一致。

## 今日验证

- 全量单测 526/526 通过 + 1 条 fitz 特性门控用例按环境跳过、集成 17/17 全绿。
- `doc-lint` 0 FAIL 0 WARN（附录 A 行数预算 950/950 已到上限）。
- 真跑验证：假 SMTP 服务器全命令序列 + TLS 直连（自签证书门控）真发成功；.ics 附件导入 →
  查询可见“每天重复”；CLI `发送邮件给…` 未配置凭据诚实提示不发送；CLI 真跑
  `导入 M:\...\events.ics`（临时 DB）返回“已从 .ics 导入 3 条日程，跳过 1 条”，
  随后 `查一下我的日程` 可见导入日程（含每天/每周重复）。
  图片表格识别（E172）：2×2 网格 → xlsx 读回 A1/B1/A2/B2；宽表头“月度销量汇总”
  → 答案如实提示“1 处疑似合并单元格（跨列）”，xlsx 落盘。
  图片表格合并还原（E173）：宽表头“月度销量汇总”→ xlsx A1:B1 合并 + “已还原 1 处”；
  两级表头（华东/华北各跨 2 列）→ A1:B1 + C1:D1 共 2 处；2×2 网格 → 无合并无 warning。
  表格网格线检测（E174）：跨行合并图（部门跨两行）→ xlsx A1:A2 合并 + “已还原 1 处…
  跨行 1 处”；既有 2×2/宽表头/两级表头 3 用例 merges 输出与 E173 一致；无边框表格回退
  文本聚类无伪合并。

## 今日收尾状态

- 已提交：E173（HEAD=`710c1a2`）。
- 待提交：E174（表格网格线检测 + 跨行合并还原）。
- 今日修复：CLI 真跑 `.ics` 路径导入时 Stage 1 脱敏剥掉盘符导致路由与 skill 收到的
  query 丢失 `.ics` 信息；已改 `src/search/pipeline.ts` 的 routeQuery 与 skillInputQuery
  （对 calendar-skill 的 `X:\...\*.ics` 用 originalQuery），真跑验证通过。
- 相关计划：`docs/plans/2026-08-21-image-table-ocr.md`（E168）、
  `docs/plans/2026-08-21-calendar-ics-export.md`（E169）、
  `docs/plans/2026-08-21-email-smtp-send.md`（E170）、
  `docs/plans/2026-08-21-calendar-ics-import.md`（E171）。
  `docs/plans/2026-08-21-image-table-xlsx.md`（E172）、`docs/plans/2026-08-21-image-table-merges.md`（E173）、`docs/plans/2026-08-21-table-gridlines-merge.md`（E174）。

## 明天继续（按优先级）

1. 提交 E174 批次（`git add` + 单主题中文提交）。
2. 合并单元格还原下期迭代：真实扫描件/手写表格噪点鲁棒性、L 形或跨行+跨列组合复杂合并区域。
3. UI 集成新能力（邮件发送/凭据配置、日历导入导出入口）。
4. 附录 A 行数预算继续按需压缩旧条目（950/950 无余量）。
## 常用命令

```bash
npm run mail:config -- --host <smtp主机> --port <端口> --secure <0|1> --user <账号> --pass <授权码> --from <发件人>
npm run dev -- "发送邮件给 a@b.com，主题：测试，正文：你好"
npm run dev -- "导入 M:\\path\\events.ics"
python scripts/office_image_ocr.py --table <图片> <out.csv>
npm run build && npm run test:all
npm exec tsx scripts/doc-lint.ts
```
