# 推进计划：日程↔提醒联动与会议邀请邮件草稿（E162）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

生活助手“邮件/日历/提醒”联动：
- 创建日程时自动登记提醒（ReminderStore），支持“提前 N 分钟/小时”，到点由 gateway 既有轮询推送；
- 查询日程展示提醒状态；
- office-daily 邮件模式新增会议邀请草稿（主题+时间+参会人+议程占位）。

## 计划

1. `calendar-skill`：创建日程后按解析时间自动登记提醒（默认到点，支持“提前 N 分钟/小时”），
   时间未定则诚实提示未设提醒；查询日程显示“已设提醒/未设提醒”。
2. `office-daily` 邮件模式：识别“会议邀请/邀请参会/会议通知”，生成会议邀请草稿
   （标题含主题+时间，正文含时间/地点/议程/参会人占位），落盘 md。
3. 测试：calendar 新增“提前提醒落库 + 查询带提醒状态”用例，office-daily 新增会议邀请草稿用例。
4. 登记附录 A（E162）、更新 plan 结果/handoff/skills README；跑 build/test/doc-lint。

**验收标准**

- 单测新增 ≥3 条全绿，集成 17/17 不变；doc-lint 0 FAIL 0 WARN；
- “帮我安排明天下午3点的周会，提前10分钟提醒”同时产出日程与提醒（ReminderStore 落 1 条）。

## 执行过程

### 改动

- src/skills/calendar-skill/index.ts：新增 parseLeadMs（提前 N 分钟/小时）；创建日程后自动登记
  ReminderStore 提醒（默认到点），时间未定诚实提示；查询日程展示已设提醒/未设提醒状态。
- src/skills/office-daily/index.ts：email 模式新增会议邀请草稿分支（主题+时间+参会人/地点/议程占位，落盘 md）。
- src/skills/calendar-skill/index.test.ts：新增 2 条单测；src/skills/office-daily/index.test.ts：新增 1 条单测。

### 遇到的问题

- 无；复用 ReminderStore 与 parseTimeExpression 既有链路，未引入新依赖。

## 结果

- 验证：npm run build 通过；doc-lint 0 FAIL 0 WARN（附录 946/950）；“明天下午3点开会提前10分钟提醒”同时落日程与提醒。
- 测试：单测 467/467 通过 + 1 条 fitz 门控跳过 + 集成 17/17。
- 提交：待用户提交（沙箱禁止写 .git）。
- 遗留事项：真实日历/邮件服务仍为本地替代；重复日程、取消提醒待排期。
