# 推进计划：路由校准设置面板接真实数据（E110）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

把设置面板的“路由校准”从 mock 表格升级为真实数据：gateway 暴露 route-case
读取/标记/导出接口，UI 表格直接展示 `data/route-cases.jsonl` 里的误判样本，
支持“标记正确”与 CSV 导出，让数据飞轮闭环可人工干预。

## 计划

1. gateway 新增 `GET /api/routing/cases`、`POST /api/routing/batch-mark`、
   `POST /api/routing/export`（CSV/JSON）。
2. `GatewayOptions` 支持注入 `RouteCaseStore`，`server.ts` 传入现有实例。
3. UI `RoutingSettings` 改为拉取真实 case，行内“标记正确”写回反馈，支持导出 CSV。
4. 补 gateway 集成测试（cases/batch-mark/export），跑 build/test/doc-lint，
   登记需求文档附录 A（E110），更新交接，提交推送。

**验收标准**

- `/api/routing/cases` 返回真实 case + audit 统计。
- batch-mark 后再次读取能看到反馈更新。
- export 产出 CSV 且包含查询文本。
- UI 设置 → 路由校准显示真实数据，空库时显示“暂无路由 case”。

## 执行过程

### 改动

- `src/gateway/app.ts`：新增三个路由校准端点；`GatewayOptions.routeCaseStore`。
- `src/gateway/server.ts`：把现有 `routeCaseStore` 注入 gateway。
- `ui/prototype/src/App.tsx`：`RoutingSettings` 接 `/api/routing/cases`，
  支持标记正确、刷新、导出 CSV。
- `src/gateway/app.test.ts`：新增 cases/batch-mark/export 集成测试。

### 遇到的问题

- CSV 单元格需转义引号，避免查询文本里的引号破坏列结构。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 322/322 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E110 已提交并推送 Gitee/GitHub。
- 遗留：Provider 测试/持久化、技能库/记忆/Token 计量真实 API、artifact 事件流、
  终端真实执行通道。
