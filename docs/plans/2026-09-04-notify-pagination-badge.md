# 推进计划：§4.1 右栏通知打磨——通知分页 + 未读角标（E331）

> 日期：2026-09-04 · 分支：v0.2b · 状态：已完成
> 承接：owner「A」——E330 收口后 §4.1 UI 打磨（handoff「后续轮候选」通知角标/分页按需项）。

## 目标

1. 通知列表分页：数据超过一屏后能翻页浏览（目前写死「最近 50 条」一次性拉取）。
2. 通知 tab 未读角标：新通知到达（含未切到通知页时）在右栏 tab 上给数字提醒，查看通知页后清零。

## 改动

### 后端：/api/notifications 支持分页

- `src/notifications/notification-store.ts`：增 `all()`（全量 append 序，供分页/总数）。
- `src/gateway/app.ts`：`/api/notifications` 改按 `page`/`pageSize` 返回（缺省 page=1、pageSize=20，pageSize 上限 200），
  响应增 `total`；entries 保持最新在前；摘要口径固定最近 200 条与分页解耦。
- `src/gateway/app.test.ts`：补分页用例（25 条日志 → pageSize 10 第 2/3 页切片正确 + total），原默认用例不变仍通过。

### 前端：ui/prototype 通知分页 + tab 角标

- `ui/prototype/src/App.tsx`：
  - 通知状态增 `notifyPage/notifyTotal`；拉取改 `/api/notifications?page=&pageSize=20`。
  - 轮询改「右栏打开即 30s 后台拉第一页」，通知页可见时拉当前页并在数据就绪后记已读水位
    （`seenTopNotifyId`，会话内记忆）；未读 = 最新序中越过已读水位的新条目数，cap 99+。
  - 通知 tab 按钮渲染 `.tab-badge` 数字角标（仅 unread>0）。
  - 通知工具栏改分页控件（上一页/下一页 + 页码/总数），替换「最近 50 条」文案。
- `ui/prototype/src/styles.css`：增 `.tab-badge`、`.notify-pager`（含禁用态），右栏 tab 按钮 `position:relative` 定位角标。

## 验收

- `npm run build` 绿；gateway 定向单测绿（含新分页用例）；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN。
- owner 手动验收：网关运行中从其它通道写入多条通知后，右栏「通知」tab 出现未读数角标；进通知页后角标消失；超过 20 条可翻页。

## 结果

- 后端：`NotificationStore.all()`；`/api/notifications` 支持 `page/pageSize` 并回 `total`（缺省 page=1/pageSize=20），摘要窗口固定最近 200 条与分页解耦。
- 前端：通知页分页工具栏（上一页/下一页 + 页码/总数 + 刷新）；通知 tab 未读角标（会话内水位：查看通知页即清零，后台 30s 拉第一页计数，99+ 封顶）。
- 验证：`npm run build` 绿；gateway/notifications 定向 42/42（新增分页切片用例：25 条 → pageSize10 第 2/3 页 + total）；`npm --prefix ui/prototype run build` 绿；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）。全量 `test:all`/bench 未跑（成本纪律）。
- 文档：需求文档附录 A E331 登记；本计划；09-04 交接追加轮。
- 提交：未提交（延续工作区待统一确认批次）。
