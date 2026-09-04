# 推进计划：通知区右栏展示——gateway 读 API + UI 面板（E320）

> 日期：2026-09-02 · 分支：v0.2b · 状态：进行中（owner 2026-09-02 指令「先不提交，推进其他」；候选「通知库 UI 展示 / 目录监听」的最小只读切片）

## 目标

E315/E316/E318 已把「人类裁决 / 困难升级 / 低置信 / 角色 Skill 输出 / AI 运营日报与预算阈值」事件自动写入通知库（`data/notifications.jsonl`），但只读侧仅 CLI「通知汇总」。本计划打通 UI 展示：gateway 增只读 `GET /api/notifications`，原型（Tauri 前端 `ui/prototype`）右栏增「通知」页实时展示。projects/ 目录监听不属本切片（§4.1 UI 阶段另一候选）。

## 计划

1. `src/gateway/app.ts`：新增 `GET /api/notifications?limit=N`——`NotificationStore.recent()` + `classifyEventPriority` 逐条标优先级（最新在前），附 `renderNotificationDigest` 文本摘要 → 验证：gateway 路由单测（env `NOTIFICATION_LOG_PATH` 指向临时文件写入事件 → 断言 entries 含优先级字段且最新在前、digest 含分组）。
2. `ui/prototype/src/App.tsx` + `styles.css`：`RightTab` 增 `notifications`；右栏 Tab 增「通知」；页面拉 `/api/notifications`（切页拉取 + 30s 轮询 + 手动刷新），按 🔴🟡🟢 优先级渲染 role/kind/title/时间，空态与 gateway 不可达提示 → 验证：`npm --prefix ui/prototype run build` 绿。
3. 文档：需求文档（§11.3 衔接 bullet + 附录 A E320）、`docs/code-directory.md`/`docs/directory-structure.md`（gateway 行 + UI 行）、计划文档结果、当日 handoff → 验证：`npm run doc-lint` 0 FAIL 0 WARN。

**验收标准**

- `npm run build` 绿；gateway 新路由单测全绿；全量单测 + 集成绿；`ui/prototype` vite build 绿；doc-lint 0 FAIL 0 WARN。
- 手工：gateway 起来后右栏「通知」显示既有通知（含 AI 运营日报 source=usage）。
- 全程零外部 LLM/API。

## 设计取舍

- 只读、无鉴权（与 `/api/usage/stats`、`/api/files` 同级）；优先级判定复用 `notification-hub` 纯函数单一口径，UI 不重写规则。
- UI 面板最小：复用右栏现有样式，不做未读角标/分页（后续 UI 阶段）。
- 不改 pipeline、不改通知写入语义。

## 执行过程

### 改动

- `src/gateway/app.ts`：`GET /api/notifications?limit=N`（缺省 50、上限 200）——`NotificationStore.recent()` 倒序（最新在前）+ `classifyEventPriority` 逐条标优先级，附 `renderNotificationDigest` 文本摘要；`GatewayOptions.notificationStore?` 注入（测试隔离）。
- `src/gateway/app.test.ts`：新增 1 条用例（临时通知库注入：最新在前 + AI 运营日报→normal / 待你裁决→urgent + digest 分组）。
- `ui/prototype/src/App.tsx`：右栏增「通知」页（RightTab + Bell 图标 + 30s 轮询/手动刷新/空态与网关不可达提示），时间格式化 `fmtNotifyTime`；`ui/prototype/src/styles.css` 增最小样式。
- 文档：需求文档 §11.3 表行 + §13 gateway 行 + 附录 A E320；`docs/code-directory.md`/`docs/directory-structure.md` 对应行。

### 遇到的问题

- 无功能问题。编码注意：exec 环境会吞「反引号+$」等转义组合，UI 代码里含 backtick 的行改用 [char]96 拼接落盘后由 vite build 验证；目录文档一处 `n 未转成换行，改按行索引重建修复。
- `bench/search-metrics.jsonl` 存在外部搜索冒烟进程的追加写入（非本任务），收尾前按 HEAD 字节恢复。
- doc-lint C1 拦截正文裸数值「30s」（§11.3 行），改为无数字措辞后 0 FAIL 0 WARN。

## 结果

- `npm run build` 绿；gateway 定向 25/25（新增 1 条）；全量单测 + 集成 32/32 绿（单测 1 skip 为既有）；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN。
- 手工验收路径：`npm run gateway` 后桌面/浏览器右栏「通知」页可见既有事件（含 source=usage AI 运营日报），30s 轮询自动出现新事件。
- 全程零外部 LLM/API。

## 遗留事项

- projects/ 目录文件变更监听仍属 §4.1 UI 阶段候选；通知未读/角标/分页待 UI 打磨。