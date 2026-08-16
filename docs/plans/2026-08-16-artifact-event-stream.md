# 推进计划：Artifact 事件流（SSE）（E118）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

给产物文件列表加事件流：gateway 提供 SSE `GET /api/events`，每次 `/api/ask`
完成后广播 `files_changed`，UI 通过 EventSource 自动刷新右侧文件列表，不再依赖
手动刷新。

## 计划

1. 新增 `src/gateway/artifact-bus.ts`：内存事件总线，支持订阅/发布/退订。
2. gateway 新增 `GET /api/events` SSE 端点；`/api/ask` 完成后发布
   `files_changed`。
3. UI 右侧栏打开时连接 EventSource，收到 `files_changed` 自动 `loadFiles()`。
4. 补测试、登记需求文档（§13 / 附录 A E118），更新交接，提交推送。

**验收标准**

- SSE 连接后先收到 `connected` 事件。
- 每次 `/api/ask` 完成后订阅者收到 `files_changed`。
- UI 右侧栏打开后文件列表随事件自动刷新。

## 执行过程

### 改动

- 新增 `src/gateway/artifact-bus.ts` 与 `artifact-bus.test.ts`。
- `src/gateway/app.ts`：`/api/events` SSE + ask 完成后发布事件。
- `ui/prototype/src/App.tsx`：EventSource 订阅 `files_changed`。
- `src/gateway/app.test.ts`：ask 完成事件断言。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 337/337 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E118 已提交并推送 Gitee/GitHub。
- 遗留：文件“生成中”实时状态（仍需 pipeline 阶段事件）、HTML 预览自动弹出、
  桌面端封装。
