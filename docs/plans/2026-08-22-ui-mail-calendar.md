# 推进计划：UI 设置面板集成邮件/日历（E179）

> 日期：2026-08-22 · 分支：v0.2b · 状态：已完成

## 目标

E170/E171 的邮件 SMTP 与日历 `.ics` 能力目前只有 CLI（`npm run mail:config` + 对话）。
本期把入口接进 UI 原型设置区：邮件凭据可读写（授权码不回显），日历支持 .ics 导出下载
与文件导入；gateway 补齐 4 个端点，calendar-skill 抽出可复用函数，不引入新依赖。

## 计划

1. `src/skills/calendar-skill/index.ts` 抽出可复用函数（行为不变）：
   - `openCalendarDb(dbPath?)`：打开/创建本地日历库（原 `ensureDb` 的建库+迁移逻辑）。
   - `buildCalendarIcs(database, now?)`：全部日程 → ICS 文本（原导出分支逻辑）。
   - `importIcsToDb(database, icsText, now?)`：解析并写入（原导入分支逻辑）。
   - `createCalendarSkill` 内联分支改为调用上述函数。
2. `src/gateway/app.ts` 新增端点（GatewayOptions 支持测试注入路径）：
   - `GET /api/mail/credentials` → `{configured, host, port, secure, user, from}`（不含 pass）。
   - `POST /api/mail/credentials` → 校验并保存凭据（复用 `mail/credentials.ts`）。
   - `GET /api/calendar/export` → `.ics` 文本下载（空库 404 诚实提示）。
   - `POST /api/calendar/import` → 收 ICS 文本，导入本地日历，返回 `{imported, skipped}`。
3. `ui/prototype/src/App.tsx` 设置区新增“邮件 / 日历”菜单与面板：
   - MailSettings：凭据表单（host/port/账号/授权码/发件人/SSL 开关）+ 保存反馈。
   - CalendarSettings：导出 .ics（Blob 下载）、导入 .ics（文件选择器）。
4. 测试：gateway 新增 2 条单测（邮件凭据读写且不暴露密码；日历导入 ICS 后导出断言）。
5. 文档：附录 A 登记 E179、skills README、handoff、doc-lint。

**验收标准（本次对齐）**

- 4 个端点行为正确：凭据 GET 不回显密码、POST 缺字段 400；日历空库导出 404、
  导入合法 ICS 后导出包含对应 SUMMARY、非法 ICS 400。
- UI 原型 `npm --prefix ui/prototype run build` 通过。
- `npm run build` + `npm run test:all` + `doc-lint`（0 FAIL 0 WARN）全绿。

## 结果

- calendar-skill 抽出 `openCalendarDb` / `buildCalendarIcs` / `importIcsToDb`，
  既有 31 条 calendar-skill 单测原样通过（行为不变）。
- gateway 新增 4 端点；gateway 单测 17/17 通过（+2：邮件凭据读写且不暴露密码、
  日历导入 ICS 并导出）。
- UI 设置区新增“邮件/日历”面板（SMTP 凭据表单、日历导出下载/文件导入），
  `ui/prototype` 生产构建通过。
- 测试：主项目 build；单测 534/534 通过 + 1 条 fitz 门控用例按环境跳过 +
  集成 17/17 全绿；doc-lint 0 FAIL 0 WARN。
- 未做：邮件发送按钮（CLI/对话已具备，UI 触发走 `/api/ask` 即可，本期不做独立发信页）；
  日历导入后的提醒登记（与 skill 一致，导入不自动设提醒）。
