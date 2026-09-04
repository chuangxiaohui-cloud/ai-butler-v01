# 推进计划：AI 运营日报 / 预算阈值事件 → 通知枢纽（E318）

> 日期：2026-09-02 · 分支：v0.2b · 状态：已完成（owner 2026-09-02 拍板 ①）

## 目标

把 §COST C-7 与 §11.3 秘书日报的衔接落地：E317 遗留候选「每日 22:00 AI 运营日报推送」——AI 运营成本日报与预算阈值事件（黄/红/用尽）自动写入通知枢纽（E315/E316 已建 `data/notifications.jsonl` + 「通知汇总」聚合），老板可随时在秘书日报里看到今日/本月成本与预算状态。本轮纯本地实现 + 离线单测，零外部 LLM/API。

## 计划

1. `src/notifications/notification-store.ts`：`source` 联合类型扩 `'usage'`（秘书 AI 运营事件），注释同步 → 验证：build 绿。
2. `src/usage/ai-ops-notify.ts`（新）：AI 运营日报 + 预算阈值事件写入通知库——`emitAiOpsDailyReport`（按天去重，marker 落盘防重复推送）、`emitAiOpsBudgetAlerts`（黄/红/用尽按档位单调去重，每次成功调用后检查）、纯函数 `todayKey/reportDateLabel/aiOpsBand`；写入失败不抛错（通知旁路）→ 验证：定向单测绿。
3. `src/search/llm-client.ts`：每次成功记账后（默认开启，env `AI_OPS_NOTIFY=0` 显式关闭）调用 `emitAiOpsBudgetAlerts`（try/catch 不阻塞回复）→ 验证：llm-client 定向单测补 1 条。
4. `src/skills/market/notification-hub.ts`：优先级分类补预算/日报关键词（预算提醒/日报→🟡 普通，预算用尽/即将耗尽→🔴 紧急）→ 验证：notification-hub 单测补 2 条。
5. `src/gateway/server.ts`：22:00 定时入口（`scheduleAiOpsReport`，启动已过 22:00 先补发一次，marker 去重；unref 不阻塞 gateway；shutdown 清理）→ 验证：build 绿。
6. `scripts/ai-ops-report.ts`（新）+ package.json `ai-ops:report`：手动兜底入口；`.env.example` 增 `AI_OPS_NOTIFY` 说明 → 验证：CLI 手动跑通（无 LLM）。
7. 文档：计划文档 → 需求文档（§14.5 衔接表改「已实现」+ §14.6/§13 目录行 + 附录 A E318）→ `docs/code-directory.md`/`docs/directory-structure.md`/AGENTS.md 目录地图 → 当日 handoff 加链接 → 验证：`npm run doc-lint` 0 FAIL 0 WARN。

**验收标准**

- `npm run build` 通过；新增/改动单测全绿（ai-ops-notify + llm-client + notification-hub + notification-store）。
- 不设置 `AI_OPS_NOTIFY` 时 llm-client 行为与现状完全一致（非破坏）。
- `npm run ai-ops:report` 首次输出「已写入」、同日内再跑输出「重复跳过」；通知库出现 role=秘书、kind=ai_ops_daily 事件且「通知汇总」可读。
- 全程零外部 LLM/API 调用（验证用临时文件路径，不污染仓库 data/）。

## 设计取舍

- **去重**：日报按「日期 marker」幂等（gateway 22:00 定时 + 手动 + 补发共用）；预算阈值事件按「当日已触发最高档位」单调去重，避免每分钟定时/每次调用重复刷屏。
- **通知为旁路**：写入失败只吞掉（与 E316 `emitSkillNotification` 同规），绝不影响 LLM 调用主流程。
- **实时阈值事件开关**：默认开启（owner 2026-09-02 拍板）；显式 `AI_OPS_NOTIFY=0` 可关；预算未配置（dailyBudgetCny=null）时不读用量文件、零副作用。日报 22:00 定时与手动入口不受该开关限制。
- **不带 UI**：右栏通知区展示仍属 §4.1 三栏 UI 阶段（候选，不动）；本轮事件经「通知汇总」（`market:notification:hub` 兜底读库）即可见。

## 执行过程

### 改动

- `src/usage/ai-ops-notify.ts`（新）：`emitAiOpsDailyReport`（按日期 marker 幂等）/ `emitAiOpsBudgetAlerts`（黄/红/用尽档位单调去重，§COST C-4）/ 纯函数 `todayKey`/`reportDateLabel`/`aiOpsBudgetBand`（阈值读 §5 [P-145]-[P-147]）；写入失败旁路不抛错。
- `src/notifications/notification-store.ts`：`source` 联合类型扩 `'usage'`（秘书 AI 运营事件），注释同步。
- `src/skills/market/notification-hub.ts`：优先级分类补预算词——预算用尽/即将耗尽→🔴 紧急，预算提醒/AI 运营日报→🟡 普通。
- `src/search/llm-client.ts`：非流式/流式两处成功记账后调用 `notifyAiOpsBudgetAfterCall()`（默认开启，env `AI_OPS_NOTIFY=0` 显式关闭；try/catch 不阻塞回复）。
- `src/gateway/server.ts`：`scheduleAiOpsReport()` 每日 22:00 定时（启动时已过 22:00 先补发一次，marker 去重；`shutdown` 清理定时器）。
- `scripts/ai-ops-report.ts`（新）+ package.json `ai-ops:report`：手动兜底入口。
- `.env.example`：增 `AI_OPS_NOTIFY` 开关说明（缺省 0）。

### 遇到的问题

- Windows 下 apply_patch 无法经 argv 传多行补丁，改由精确字符串替换落地（内容等价，差异仅落盘方式）。
- 首次 build 报 `entry.detail` 可能 undefined（detail 为可选字段）→ 断言改 `entry?.detail?.includes(...)`。

## 结果

- 验证：`npm run build` 绿；定向单测 **31/31**（ai-ops-notify 4 + notification-hub 1 + llm-client 1 + 既有 25）；全量单测 **1302/1303**（1 skip 既有）+ 集成 **32/32**；`npm run doc-lint` 0 FAIL 0 WARN。
- 无 LLM 冒烟 ok：临时通知库（env `NOTIFICATION_LOG_PATH`/marker）两次 `npm run ai-ops:report`——首跑 `emitted`、同日再跑 `dup`；通知库出现 `{role:秘书, kind:ai_ops_daily, source:usage}` 事件（detail 含今日 ¥0.00/预算 ¥5、本月 ¥0.07/¥150、调用 1683 次、模型明细），「通知汇总」兜底读库可聚合。全程零外部 LLM/API。
- 文档：需求文档 §14.4/§14.5/§14.6/§13 + 附录 A E318；`docs/code-directory.md`、`docs/directory-structure.md` 同步；当日 handoff 加链接。

## 遗留事项

- 22:00 定时依赖 gateway 常驻（桌面壳拉起时运行）；gateway 未运行时以手动 `npm run ai-ops:report` 兜底，桌面壳开机自启属 §4.1 桌面阶段候选。
- 右栏通知区 UI 展示 / projects/ 目录监听仍属 §4.1 三栏交互 UI 阶段。
- §COST 其余候选不变：调用后成本摘要 footer、单次调用 ⏸️ 暂停确认（需 E309 confirm 阻断式 UI）、budget_override 的 decision-log cost 字段。

