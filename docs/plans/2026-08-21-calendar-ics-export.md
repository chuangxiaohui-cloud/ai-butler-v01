# 推进计划：日历 .ics 导出（E169）

> 日期：2026-08-21 · 分支：v0.2b · 状态：已完成

## 目标

按 ADR-0002 阶段 1，让用户说“导出我的日历 / 导出日程到文件 / 保存日历到文件”时，
把本地 `calendar_events` 导出为可导入标准日历软件的 `.ics` 文件（含每天/每周重复规则）。

## 计划

1. 意图层：`ACTION_RE` 增加“日历/日程导出”query 特判，命中现有 R004 → `calendar_skill` + `local_query`，不再偏到 web_search。
2. calendar-skill：`local_query` 分支识别导出关键词，生成 `BEGIN:VCALENDAR` + 每条 `VEVENT`
   （`DTSTART` 转 UTC `YYYYMMDDTHHMMSSZ`，`repeat=daily/weekly` → `RRULE:FREQ=DAILY/WEEKLY`，
   含 `UID`/`DTSTAMP`/`SUMMARY`），落盘 `data/office/日历-<ts>.ics`，空日程诚实提示。
3. 测试：skill 创建日程+重复日程后导出，校验文件存在、含 `BEGIN:VCALENDAR`/`RRULE`/标题；
   router-v2 手测导出类 query 不再走 web_search。
4. 文档：附录 A 登记 E169、更新 skills README 与 handoff。

**验收标准**

- `导出我的日历` / `导出日程到文件` / `把日历转成ics` → `local_query` + `calendar_skill` 直接路由（confidence 0.85）。
- 导出文件为合法 ICS：以 `BEGIN:VCALENDAR` 开头、`END:VCALENDAR` 结尾，重复日程含 `RRULE`。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 执行过程

### 改动

- `src/agent/intent-feature.ts`：`ACTION_RE` 在通用 `query` 前插入
  `/导(?:出|下载).*(日历|日程)|(?:日历|日程).*(导出|保存|下载|\.?ics)/i`，导出类 query 由 unknown → query。
- `src/skills/calendar-skill/index.ts`：`createCalendarSkill` 支持 `outDir` 可选参数；
  `local_query` 分支增加导出检测与 ICS 生成（`escapeIcsText`/`toIcsDateTime` 小助手），
  空日程返回“暂无日程可导出”诚实提示。
- `src/skills/calendar-skill/index.test.ts`：新增导出用例（每天+每周日程 → ICS 含 RRULE 与标题）。
- `src/agent/router-v2.test.ts`：新增导出路由用例。
- 文档：附录 A E169、`src/skills/README.md` calendar-skill 行、`docs/2026-08-21-progress-handoff.md`。

### 遇到的问题

- 计划文档上一会话未落盘，本次重建。
- 附录 A 行数预算 947/950，E169 单行插入后 948/950，无需压缩。

## 结果

- 验证：`npm run build`、`npm run test:all`、`npm exec tsx scripts/doc-lint.ts` 全绿。
- 测试：单测 495/495 + 1 条 fitz 门控按环境跳过 + 集成 17/17。
- 提交：`061c618` · 推送：待 push:hosts
- 遗留事项：邮件 SMTP 发送（ADR-0002 阶段 1）、ICS 导入。
