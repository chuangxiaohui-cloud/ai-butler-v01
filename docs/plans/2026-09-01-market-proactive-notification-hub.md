# 推进计划：市场 Skill 沉淀第 15 批——秘书主动预判 + 通知枢纽（E313/E314）

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

按五角色审阅 P2（💁秘书缺口1「主动预判」+ 缺口3「信息枢纽」）落地两个逻辑型市场 Skill：`proactive-assistant`（§2.5「有眼力见儿」，命中规则后仅建议不自动执行）与 `notification-hub`（§11.3 秘书日报，按优先级聚合五角色事件）。至此五角色审阅全部缺口清空。用户累积 Skill 38→40。

## 计划

1. `src/skills/market/proactive.ts`：`proactiveSuggestions(text, {workedMinutes?})` 规则引擎（日期+地点→差旅 / 报销→报销单 / 开会→会议安排 / 连续工作≥2h→休息）+ `detectTravelIntent` + `formatProactiveSuggestions`（仅建议、不自动执行）→ verify: proactive 单测
2. `src/skills/market/notification-hub.ts`：`HubEvent` + `classifyEventPriority`（🔴 紧急 裁决/阻塞 / 🟡 普通 PRD完成/选型建议 / 🟢 低 日常进度）+ `renderNotificationDigest` + `parseEventsInput` → verify: notification-hub 单测
3. 薄 CLI `scripts/market-{proactive-assistant,notification-hub}.ts` + package.json `market:proactive:assistant` / `market:notification:hub` → verify: build 绿
4. 2 个 manifest（proactive 触发词避让 reminder「提醒我」；notification-hub 含「秘书日报」最长优先于 docx-write「日报」）本地安装 → verify: 市场包 40
5. 真实冒烟 2 Skill 全链 ok:true + maturity:check 38→40 + doc-lint 0 FAIL 0 WARN

**验收标准**

- `proactiveSuggestions`：下周三去深圳见供应商→travel；报销→reimbursement；评审会→meeting；连续工作 3 小时/workedMinutes≥120→rest；普通问答→空
- `classifyEventPriority`：risk_decision/blocking→urgent；prd_done/tech_selection→normal；progress→low（detail 含「完成」不误升级）
- `renderNotificationDigest`：按 🔴🟡🟢 分组；空事件→「暂无待处理通知」
- 触发词：主动提醒/有什么建议/主动建议/有眼力见；通知汇总/每日简报/秘书日报/通知中心；「提醒我明天开会」归 reminder 不抢；「通知是什么」不命中
- 冒烟 2 Skill ok:true + 市场包 38→40 + maturity 40/50+ + doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/skills/market/proactive.ts`（E313）：`proactiveSuggestions`——差旅（DATE_RE+TRAVEL_VERB_RE+CITY_RE 组合）/报销/开会/休息（文本「连续工作 N 小时」或 workedMinutes 参数）四类建议；`formatProactiveSuggestions` 输出「💡 主动建议（仅建议、不自动执行）」。
- `src/skills/market/notification-hub.ts`（E314）：优先级分类以 kind/title 为主、全文仅用于紧急兜底（detail 的「完成」不把日常进度误升级为普通）；`renderNotificationDigest` 输出 §11.3 秘书日报 Markdown；`parseEventsInput` 支持 E251 内嵌 JSON 数组或事件文件路径。
- `scripts/market-proactive-assistant.ts` / `scripts/market-notification-hub.ts` + package.json 两个 `market:*` 脚本（E251 @input）。
- 2 个 manifest：`proactive-assistant`（主动提醒/有什么建议/主动建议/帮我看看要注意什么/看看有什么要注意/预判一下/有什么要留意的/有眼力见——不含「提醒我/提醒」防抢 reminder）；`notification-hub`（通知汇总/消息聚合/每日简报/通知中心/看看有什么通知/聚合通知/汇总通知/秘书日报/通知简报——「秘书日报」最长触发词优先于 docx-write「日报」）。

### 遇到的问题

- **reminder 撞车**：reminder 有裸「提醒/提醒我」触发词，proactive 若登记「提醒我一下」会抢走 reminder 的设提醒意图——proactive 触发词整体避让「提醒我」，并补「提醒我明天开会→不命中 proactive」单测。
- **优先级误升级**：日常进度事件 detail 含「完成」（如「A 模块完成」）会被普通级规则误判——分类改为 kind/title 为主、全文只做紧急兜底。
- **触发词防误触**：裸「通知/建议/复盘」不登记；「通知是什么」「日报怎么写」不命中（E301/E305 纪律延续）。

## 结果

- 验证：`npm run build` 绿；proactive 6/6 + notification-hub 6/6 + nl-router 35/35（新增 6 条：主动提醒命中 / 有什么建议自然问法 / 提醒我不抢 reminder / 通知汇总命中 / 秘书日报最长优先 / 通知是什么防误触）；doc-lint 0 FAIL 0 WARN；真实冒烟 2 Skill 全链 ok:true——proactive「下周三要去深圳见供应商，顺便报销这次差旅费」→ 差旅安排+报销单 两条建议、notification-hub 三事件 → 🔴紧急1/🟡普通1/🟢低1 分组摘要；maturity:check 用户累积 Skill **38→40**/50+。
- 测试：proactive 6/6 + notification-hub 6/6 + nl-router 35/35。
- 提交：未提交（owner 未要求）。
- 遗留事项：五角色审阅全部清空；剩余候选——Outlook OAuth2（XOAUTH2）、E309-后 confirm 阻断式（等 owner 拍板）、v2.6 pre-ship 封版确认、v1.0 大章节（MCP 子 Agent/证据链 UI/远程对话通道/代码托管联动）。
