# 推进计划：通知枢纽自动写入（E315）

> 日期：2026-09-02 · 分支：v0.2b · 状态：已完成

## 目标

补齐 E314 诚实登记的缺口：`notification-hub` 此前只能读「输入事件/文件路径」，没有数据来源。本次新增 `NotificationStore`（append-only JSONL `data/notifications.jsonl`），并在 pipeline 的「人类裁决 / 困难升级 / 低置信」4 处自动写入通知事件（老板风险裁决请求 / 连续纠正/失败升级 / 低置信答复），让 §11.3 秘书日报有真实数据可聚合。

## 计划

1. `src/notifications/notification-store.ts`：NotificationStore（P15 JSONL 追加/轮转/读缓存，env `NOTIFICATION_LOG_PATH` 覆盖，缺省 `data/notifications.jsonl`；事件 schema 复用 HubEvent）→ verify: store 单测
2. pipeline 接线：`PipelineDeps.notificationStore?`（Pick add）+ `defaultNotificationStore` 单例 + `safeNotify`（写入失败不阻塞）+ 4 处自动写入（human_arbitration→老板 risk_decision、user_correction/consecutive_failure→秘书 escalation、low_confidence→秘书 low_confidence）→ verify: pipeline 单测
3. `notification-hub`：NORMAL_RE 增 low_confidence/低置信（低置信→普通级）；CLI 无内嵌事件/无路径时兜底读通知库 → verify: hub 单测 + 无 LLM 冒烟
4. 冒烟：临时通知库（env 覆盖）→ CLI「通知汇总」出 🔴🟡🟢 摘要；doc-lint 0 FAIL 0 WARN

**验收标准**

- NotificationStore：add+recent 往返、source 透传、recent 条数限制、env 覆盖、缺省路径锚定 data/
- pipeline 自动写入：澄清/待裁决 → 老板 risk_decision「待你裁决」；低置信 → 秘书 low_confidence
- hub 分类：escalation→urgent；low_confidence→normal
- 冒烟：无内嵌事件时兜底读通知库出分组摘要；doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/notifications/notification-store.ts`：`NotificationStore.add/recent/close` + `notificationLogPath()`（env `NOTIFICATION_LOG_PATH` 覆盖，缺省 `import.meta.url` 锚定仓库 `data/notifications.jsonl`）；`NotificationEntry extends HubEvent`（id/source/createdAt 必填，add 缺省 source=decision、ts=写入时刻 ISO）。
- `src/search/pipeline.ts`：`PipelineDeps.notificationStore?`（Pick<NotificationStore,'add'>，测试可注入，缺省共享单例）+ `safeNotify`（写入失败不阻塞主对话）+ 4 处自动写入——① human_arbitration（option_clarify/must_clarify 摆选项）→ `{role:'老板', kind:'risk_decision', title:'待你裁决'}`；② user_correction 连续纠正升级 → `{role:'秘书', kind:'escalation', title:'连续纠正升级'}`；③ consecutive_failure 连续失败升级 → `{role:'秘书', kind:'escalation', title:'连续失败升级'}`；④ low_confidence 低于 [P-16] → `{role:'秘书', kind:'low_confidence', title:'低置信答复'}`。
- `src/skills/market/notification-hub.ts`：NORMAL_RE 增 `low_confidence|低置信`（低置信事件→普通级，不进紧急）。
- `scripts/market-notification-hub.ts`：无内嵌事件且非文件路径时兜底读 `NotificationStore.recent()`（E251「通知汇总」直接出秘书日报）。

### 遇到的问题

- **低置信优先级**：low_confidence 事件若按缺省规则落低优先级（🟢），owner 看不到质量信号——NORMAL_RE 增 low_confidence/低置信，落普通级（🟡）。
- **写入不阻塞**：通知是旁路信号，4 处写入全部经 `safeNotify` 兜底（try/catch），与 decisionLog 记录互不影响。

## 结果

- 验证：`npm run build` 绿；notification-store 4/4 + notification-hub 7/7 + pipeline 63/63（新增 3 条：待裁决→老板 risk_decision / 低置信→low_confidence / hub 分类 escalation+low_confidence）；doc-lint 0 FAIL 0 WARN；无 LLM 冒烟 ok——临时通知库（env `NOTIFICATION_LOG_PATH`）→ `npm run market:notification:hub -- <input.txt>`（输入「通知汇总」无内嵌事件）→ 兜底读库出「🔴 紧急 1（老板待裁决）/ 🟡 普通 2（PRD 完成 + 低置信）」分组摘要。
- 测试：notification-store 4/4 + notification-hub 7/7 + pipeline 63/63。
- 提交：未提交（owner 未要求）。
- 遗留事项：通知库「角色 Skill 输出事件（PRD 完成/选型建议）自动写入」需各角色 Skill 显式 emit（涉 §4.1 三栏交互 UI 阶段，登记候选）；剩余候选——Outlook OAuth2、E309-后 confirm 阻断式（等 owner 拍板）、v2.6 pre-ship 封版确认、v1.0 大章节。
