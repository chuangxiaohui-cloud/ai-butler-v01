# 推进计划：日历 .ics 导入（E171）

> 日期：2026-08-21 · 分支：v0.2b · 状态：已完成

## 目标

按 ADR-0002 阶段 1，让用户上传/给出 `.ics` 文件时说“导入这个日程文件”，
把标准 iCalendar（VCALENDAR/VEVENT）解析后写入本地 `calendar_events`
（每天/每周重复映射 RRULE，复杂周期诚实跳过），补齐 E169 的导入闭环。

## 计划

1. `calendar-skill`：
   - 新增 `parseIcs(text)`（导出供测试）：展开 RFC 5545 折叠行，提取每条 VEVENT 的
     SUMMARY/DTSTART/RRULE(FREQ)/UID，支持 `YYYYMMDDTHHMMSSZ`（UTC）与 `YYYYMMDD`（全天）。
   - 新增导入分支：查询含“导入”+“日历/日程/ics”，从附件 `.ics` 或查询中的显式文件路径读文本；
     解析 → 映射 repeat（DAILY→daily、WEEKLY→weekly，MONTHLY 等复杂周期跳过并计数）；
     写入 `calendar_events`（title/start_at/time_expression/repeat），重复导入按标题+时间去重；
     空/损坏文件、无可解析事件诚实提示；导入不自动批量登记提醒（结果中说明）。
2. 意图层：`query` ACTION_RE 增加“导入日历/日程/ics”特判（对齐 E169 导出），命中 R004 →
   `calendar_skill` + `local_query`，不再偏到 web_search。
3. 测试：parseIcs 单测（多事件/重复规则/中文标题/UTC 与全天）；导入真跑（写文件→执行→查询可见；
   复杂周期跳过；空文件诚实提示）；router 导入路由。
4. 文档：附录 A 登记 E171、skills README calendar-skill 行、handoff。

**验收标准**

- `导入这个日历文件`（带 .ics 附件或查询中显式路径）→ 解析并入库，返回“已导入 N 条日程”。
- 每天/每周 RRULE → 落库 repeat=daily/weekly；每月/每年等复杂周期 → 跳过并诚实计数。
- 空文件 / 无 VEVENT / 损坏文本 → 诚实提示，不写库。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 执行过程

### 改动

- `src/skills/calendar-skill/index.ts`：新增 `parseIcs`（RFC 5545 折叠行展开、DTSTART UTC/本地/全天、
  转义反转义、多 VEVENT）与 `isCalendarImportQuery`；execute 顶部新增导入分支——附件 `.ics` 或
  查询显式路径读文本 → 解析 → RRULE 映射 repeat（DAILY/WEEKLY），MONTHLY 等跳过计数，
  按标题+时间去重后写入 `calendar_events`；空文件/无 VEVENT/无附件诚实提示；导入不自动批量登记提醒。
- `src/agent/intent-feature.ts`：`query` ACTION_RE 增加“导入日历/日程/ics”特判（对齐 E169），
  `DOMAIN_RE schedule` 增加 `\.ics`，命中 R004 → `calendar_skill` + `local_query`。

### 遇到的问题

- 测试中 `Buffer.from(ics).buffer` 返回共享 ArrayBuffer 池（带池外多余字节），跨用例污染导致
  多导入/误判；改为 `slice(byteOffset, byteOffset + byteLength)` 精确切片后全绿。
- PowerShell 内联中文匹配乱码：改用 ASCII 锚点 + 行号拼接方式定位插入。
- CLI 真跑 `导入 X:\...\events.ics` 时，Stage 1 `sanitizeQuery` 脱敏会剥掉盘符路径，
  导致路由与 skill 收到的 query 都丢失 .ics 信息（skill 走了查询分支返回“暂无日程”）；
  已在 `src/search/pipeline.ts` 修复：routeQuery 对含 .ics 盘符路径改用 originalQuery；
  skillInputQuery 对 `calendar-skill` 且原始 query 含 `X:\...\*.ics` 同样改用 originalQuery。

## 结果

- 验证：`npm run build`、`npm run test:all`、`npm exec tsx scripts/doc-lint.ts`（0 FAIL 0 WARN）全绿。
- 真跑验证：临时 DB 下 `npm run dev -- "导入 M:\...\events.ics"` 返回“已从 .ics 导入 3 条日程，
  跳过 1 条”（MONTHLY 复杂周期）；随后 `查一下我的日程` 可见 3 条导入日程（含每天/每周重复）。
- 测试：单测 520/520 + 1 条 fitz 门控跳过 + 集成 17/17；新增 10 条（parseIcs 2、附件/路径导入、
  复杂周期跳过、空文件、无附件提示、路由 2、pipeline 真跑导入 1）。
- 提交：待提交 · 推送：待 push:hosts
- 遗留事项：附录 A 行数预算已到 950/950（后续 E 条目需压缩旧条目或扩容）；UI 集成导入/导出；
  表格识别复杂表头/合并单元格。
