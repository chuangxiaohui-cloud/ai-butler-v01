# 推进计划：裁决后旧「待你裁决」通知去残留（E336，2026-09-04）

> 关联：E324（confirm 真阻断三刀）/ E323（裁决记录）/ E331（右栏通知分页与未读角标）。
> 前置裁决：owner「A」选定本项——E324 已知边界「通知区旧『待你裁决』通知不随裁决消失（通知库 append-only，E323 起行为）」收口。

## 目标

裁决面板 / 对话确认卡对某 pending 批准或否决后，右栏「通知」里的对应「待你裁决」条目不再残留展示；裁决记录与通知库保持 append-only（审计不动），仅读侧过滤。

## 计划

1. `src/notifications/notification-store.ts`：`NotificationEntry` 增可选 `decisionId`（关联 decision-log pending 记录 id），`add()` 入参放行。
2. `src/search/pipeline.ts`：两处写「待你裁决」通知前先拿 `record()` 返回的 pending id，随通知写入 `decisionId`。
3. `src/escalation/decision-log.ts`：新增 `all()`（append 序全量），供通知侧查询已裁决 refId。
4. `src/gateway/app.ts` `GET /api/notifications`：读 decision-log 的 refId 集合，过滤 `decisionId` 已裁决的通知；聊天「执行/取消」与面板批准/否决都走同一 `adjudicate`（append refId 行），两种路径自动覆盖。
5. 测试与文档：store/pipeline/gateway 三处补 E336 断言；附录 A 登记；本计划；09-04 交接补小节。

**验收标准**

- `npm run build` 绿。
- 定向单测（dist 后）：notification-store 6/6、pipeline 全量（E315/E324 断言补 decisionId）、gateway 全量（新增 E336 用例）通过。
- `npm run doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/notifications/notification-store.ts`：`NotificationEntry.decisionId?: string` + `add()` 入参扩展；`parseEntry` 天然透传该字段（往返单测覆盖）。
- `src/search/pipeline.ts`：option_clarify/must_clarify 路径与 confirm 写类挂起路径各改为 `const pending = …record(...)` 后 `safeNotify({…, decisionId: pending.id})`。
- `src/escalation/decision-log.ts`：新增 `all()`。
- `src/gateway/app.ts` `GET /api/notifications`：先用 `logStore.all()` 收集 `refId`，`visible = all.filter(e => !e.decisionId || !decided.has(e.decisionId))`，total/entries/digest 都基于 visible。
- 测试：notification-store 1 条（decisionId 往返）、pipeline E315/E324 各补 1 断言（通知 decisionId == pending id）、gateway 新增 1 条（未裁决展示 → 否决后消失，无关通知保留）；既有两个 notifications GET 测试注入空临时 DecisionLog 隔离真实 data/。

### 遇到的问题

- 通知 GET 测试原先未注入 decisionLog，新过滤逻辑会读真实 `data/decision-log.jsonl`——给既有两个 GET 测试补空临时 DecisionLog 注入，消除环境耦合。
- 旧通知（改造前写入、无 decisionId）无法追溯关联，仍会展示——接受为遗留边界，新流程生效。

## 结果

- 验证：`npm run build` 绿；定向单测 103/103（notification-store + pipeline + gateway 三文件全绿）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。全量 test:all/bench 未跑（成本纪律）。
- 文档：需求附录 A E336 登记、本计划、09-04 交接小节已同步。
- 提交：未提交（待 owner 拍板批次）。
- 遗留事项：改造前已写入的无 decisionId 旧「待你裁决」通知不追溯（历史数据）；裁决恢复执行失败仍只在面板/对话留 error 回执（E324 已知边界，不属本项）。真实 UI 冒烟待 owner：通知页出现「待你裁决」后在裁决页否决 → 该通知消失。
