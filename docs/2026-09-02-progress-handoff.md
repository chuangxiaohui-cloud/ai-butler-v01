# 进度交接 2026-09-02（通知枢纽闭环：自动写入 E315 + 角色 Skill 事件 E316）

> 当前分支：v0.2b｜本轮收口：通知枢纽「事件写入 → 聚合摘要」闭环——E315 pipeline 裁决/升级/低置信自动写入 + E316 角色 Skill 输出事件自动入通知库（§11.3 秘书日报）。
> 上一份交接见 `docs/2026-09-01-progress-handoff.md`（五角色审阅 P1/P2 全部落地：E310-E314，用户累积 Skill 40/50+）。

## 今日完成

### 1. 通知枢纽自动写入 E315（2026-09-02）

- **代码**：
  - `src/notifications/notification-store.ts`——`NotificationStore`（P15 JSONL append-only `data/notifications.jsonl`，env `NOTIFICATION_LOG_PATH` 覆盖，`import.meta.url` 锚定仓库根；`NotificationEntry extends HubEvent`：id/source/createdAt/ts）。
  - `src/search/pipeline.ts`——`PipelineDeps.notificationStore?`（Pick add，测试可注入，缺省共享单例）+ `safeNotify`（写入失败不阻塞）+ 4 处自动写入：① 待裁决（option_clarify/must_clarify）→ 老板 risk_decision「待你裁决」；② 连续纠正升级 → 秘书 escalation；③ 连续失败升级 → 秘书 escalation；④ 低置信 [P-16] → 秘书 low_confidence。
  - `src/skills/market/notification-hub.ts`——NORMAL_RE 增 `low_confidence|低置信`（低置信→普通级）；`scripts/market-notification-hub.ts` 无内嵌事件/无路径时兜底读通知库。
- **验证**：`npm run build` 绿；notification-store 4/4 + notification-hub 7/7 + pipeline 63/63（新增 3 条）；doc-lint 0 FAIL 0 WARN；无 LLM 冒烟 ok——临时通知库（env 覆盖）→「通知汇总」兜底读库出 🔴紧急1（老板待裁决）/🟡普通2（PRD 完成+低置信）分组摘要。
- **文档**：`docs/plans/2026-09-02-notification-hub-write.md`；附录 A E315。

### 2. 角色 Skill 输出事件自动入通知库 E316（2026-09-02）

- **代码**：① `src/notifications/notification-store.ts` 新增 `emitSkillNotification`（source=skill，写入失败不阻塞 Skill 主流程）；② 5 个角色 Skill CLI 成功路径接入——`prd-template`→产品经理 prd_done、`tech-selection`→系统架构师 tech_selection、`user-story`→产品经理 user_story_done、`interface-contract`→系统架构师 interface_contract、`milestone-review`→项目经理 milestone_review；③ `notification-hub` NORMAL_RE 增 `user_story|用户故事|contract|接口契约`（角色输出→🟡 普通）。
- **验证**：`npm run build` 绿；notification-store 5/5 + notification-hub 8/8（新增 2 条）；doc-lint 0 FAIL 0 WARN；无 LLM 冒烟 ok——`market:user:story` 成功后通知库自动出现 `{role:产品经理, kind:user_story_done, source:skill}`，「通知汇总」读为 🟡 普通（含详情路径）。
- **文档**：`docs/plans/2026-09-02-skill-event-notify.md`；附录 A E316。
- **遗留**：通知库「右栏通知区 UI 展示 / projects/ 目录文件变更监听」仍属 §4.1 三栏交互 UI 阶段（登记候选）。

### 3. §COST AI 运营成本感知闭环（2026-09-02 追加）

- **背景**：owner 提出 §COST 成本感知协议（每次外部 LLM/API 调用视为成本事件，实时可见/告警/门禁），拍板顺序「代码最小闭环 + 计划文档」先行、git 暂不提交。
- **代码**：`src/config/model-pricing.ts` 单价表（DeepSeek flash/pro/vision + 智谱 glm-5.2/5.3/5-turbo 跳档 + MiniMax M2.7/highspeed/M3，官方价目 2026-09-02）+ `src/usage/cost.ts`（估算/聚合/黄红用尽分级告警/硬停门禁）+ `usage-store.ts` 缓存拆分 + `usage-budget.ts` AI 运营预算（默认启用日 ¥5 / 月 ¥150，hardStop 关）+ `llm-client.ts` 预调用门禁 + `scripts/ai-ops-cost.ts`（`npm run cost:today`）。
- **文档收口**：需求文档正文新增 §14 §COST 章节；§5 注册表 P-143~P-148（日预算/月预算/黄 50%/红 80%/用尽·硬停 100%/空闲折价 0.5）；§13 目录行；附录 A E317；`params.ts` 5 新 key 且代码真实读取（C8 75 key）。
- **验证**：build 绿；doc-lint 0 FAIL 0 WARN；单测 1296/1297（1 skip 既有）+ 集成 32/32；`cost:today` 今日 ¥0.00/月 ¥0.07 无新增调用；全程零外部 LLM/API。
- **文档**：`docs/plans/2026-09-02-ai-ops-cost.md`（状态：已完成）；已随 E306-E317 批次提交（`1290959`/`0756133`/`d0eb7cc`，2026-09-02）。

### 4. AI 运营日报 / 预算阈值事件入通知枢纽（2026-09-02 追加，E318）

- **代码**：`src/usage/ai-ops-notify.ts`（emitAiOpsDailyReport 按日幂等 + emitAiOpsBudgetAlerts 档位单调去重）；`NotificationStore.source` 扩 `usage`；notification-hub 预算词分级（用尽/即将耗尽→🔴，提醒/日报→🟡）；llm-client 成功记账后阈值事件（默认开启，`AI_OPS_NOTIFY=0` 显式关）；gateway 22:00 定时 + `npm run ai-ops:report` 手动兜底。
- **验证**：build 绿；定向 31/31；全量单测 1302/1303（1 skip）+ 集成 32/32；doc-lint 0 FAIL 0 WARN；无 LLM 冒烟——`ai-ops:report` 首跑 emitted / 同日 dup，通知库出现 role=秘书 ai_ops_daily source=usage。
- **文档**：`docs/plans/2026-09-02-ai-ops-notify.md`（已完成）；附录 A E318。
- **待拍板**：owner 已拍板实时阈值事件默认开（`AI_OPS_NOTIFY=0` 显式关）；本轮仍未提交。

### 5. /cost 斜杠命令——老板问答 AI 运营成本入口（2026-09-02 追加，E319）

- **代码**：`src/slash/slash-commands.ts` 增 `/cost`——`SlashCommandName` 增 `cost`、`SLASH_PATTERN` 整行匹配、`runCost()` 复用 `readUsage` + `formatAiOpsReport`（与 `npm run cost:today` 同一报告口径）、`handleSlashCommand` 在会话 ID 检查前路由（全局只读，无需 conversationId）；`SlashContextDeps.costOptions.usageFile/budgetFile` 供测试注入；CLI/gateway 既有分发入口无需改动。
- **验证**：build 绿；slash 定向 13/13（新增 4 条：整行识别 / 无 conversationId 可执行 / 携带 conversationId 可用 / 数据源异常可读兜底）；全量单测 1306/1307（1 skip 既有）+ 集成 32/32；doc-lint 0 FAIL 0 WARN；CLI `/cost` 冒烟输出含「📊 AI 运营成本 / 今日 / 本月 / 预算」；全程零外部 LLM/API。
- **文档**：`docs/plans/2026-09-02-ai-ops-slash-cost.md`（已完成）；需求文档 §14.4 / §14.6 / 附录 A E319；`docs/code-directory.md` / `docs/directory-structure.md` 斜杠层行。
- **待拍板**：E318/E319 是否提交（owner 已指示 git 暂不提交、先推进其他）。

### 6. 通知区右栏展示——gateway 读 API + UI 面板（2026-09-02 追加，E320）

- **代码**：`src/gateway/app.ts` 新增 `GET /api/notifications?limit=N`（缺省 50/上限 200）——`NotificationStore.recent()` + `classifyEventPriority`（最新在前）+ `renderNotificationDigest` 摘要；`GatewayOptions.notificationStore` 注入隔离。`ui/prototype/src/App.tsx` 右栏增「通知」页（30s 轮询 + 手动刷新 + 🔴🟡🟢 渲染 + 空态/网关不可达提示）；`styles.css` 最小样式。
- **验证**：build 绿；gateway 定向 25/25（新增 1 条）；`npm --prefix ui/prototype run build` 绿；doc-lint 0 FAIL 0 WARN；全程零外部 LLM/API。
- **文档**：`docs/plans/2026-09-02-notify-panel.md`（已完成）；需求文档 §11.3/§13/附录 A E320；`docs/code-directory.md`/`docs/directory-structure.md`。
- **待拍板**：E318/E319/E320 是否随下批提交（owner 已指示暂不提交、先推进其他）。

## 明日待办（接续点）

1. v2.6 pre-ship 增补封版（2026-09-02）：E306-E317 已入库（`1290959` 代码 / `0756133` 文档 / `d0eb7cc` bench），新 tag `v2.6-pre-ship-2026-09-02` + ZIP（`ai-butler-v2.6-pre-ship-2026-09-02.zip`，SHA256 见 `docs/audit-t6/pre-ship-closure.md` §4.1b），待 owner 最终验收确认。
2. v1.0：P-10 唯一阻塞为 L2 成熟度——待 owner 按快照路径累积（Skill 40/50+ → 50+ / 反馈 n≥30 / 复用率 60%）；P-12 Tavily 配额已重置待 owner 复核 `bench:v01`。
3. E306-E317 批次已提交（2026-09-02）；其后的 E318/E319（AI 运营日报/阈值事件入通知 + `/cost` 斜杠命令）已完成但未提交（owner 指示先不提交，见下条）。工作区审计交付物（`审计交付/`、audit ZIP、audit-t3 文档等）按约定不入库。
4. E318/E319/E320 收口待拍板：代码与文档全绿（全量单测 1306/1307 + 集成 32/32 + doc-lint 0 FAIL 0 WARN；E320 另加 UI vite build 绿）；owner 拍板是否随下批提交。

## 后续候选（owner 拍板后启动）

- **Outlook OAuth2（XOAUTH2）**：Outlook.com 已停用 IMAP 账号密码基本认证（实测 `NO Basic authentication is disabled.`），若要用 Outlook 做第二邮箱需实现 OAuth2 IMAP（Azure 应用注册 + 令牌刷新），登记为候选。
- **E309-后：confirm 阻断式 + 批准/否决面板**（E309 已落地记录侧，非破坏式）：§2.3 人类裁决「阻断执行 + 面板点批准/否决」依赖 §4.1 三栏交互 UI，待 owner 拍板「confirm 是否改阻断式」后启动。
- **通知库 UI 展示 / 目录监听**：E314/E316 已打通「角色 Skill 输出事件 → 通知库 → 摘要聚合」；右栏通知区 UI 展示与 projects/ 目录文件变更监听属 §4.1 三栏交互 UI 阶段，登记为候选。
- **v2.6 pre-ship 封版确认**：增补 tag `v2.6-pre-ship-2026-09-02` + ZIP 已生成（2026-09-02，含 E306-E317），待 owner 最终验收（收口报告 §6 / §4.1b）。
- **v1.0 大章节**：MCP 子 Agent、证据链 UI、远程对话通道、代码托管联动等，见 §4.4 里程碑表与 P-10 验收口径。

**预估成本(¥)**：¥0（本日全部为本地实现 + 离线单测 + 无 LLM 冒烟；无 LLM/API 付费调用）。
