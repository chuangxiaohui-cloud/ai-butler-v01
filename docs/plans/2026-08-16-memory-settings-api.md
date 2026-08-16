# 推进计划：记忆管理设置接真实数据（E114）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

把设置面板“记忆管理”从 mock 升级为真实数据：读取 L1（情景/技能经验）与
L2（语义事实）合并视图，支持按层筛选、搜索与“手动遗忘”删除。

## 计划

1. `UserContextStore` 增加公开 `listFacts()` / `deleteFact()` / `listSessions()`。
2. `ExperienceManager` 增加公开 `list()` / `remove()`。
3. gateway 新增 `GET /api/memory`、`POST /api/memory/forget`，
   `server.ts` 注入现有存储实例。
4. UI 记忆管理页拉取真实条目，支持 L1/L2 筛选、搜索、遗忘。
5. 补测试、登记需求文档（§13 / 附录 A E114），更新交接，提交推送。

**验收标准**

- `/api/memory` 返回事实/会话/技能经验合并视图。
- forget 能删除对应条目并返回 `ok`。
- UI 筛选与搜索生效，空库显示“暂无记忆条目”。

## 执行过程

### 改动

- `src/memory/user-context-store.ts` / `experience.ts`：公开读取与删除方法。
- `src/gateway/app.ts` / `server.ts`：memory 两接口 + 存储注入。
- `ui/prototype/src/App.tsx` + `styles.css`：记忆管理真实页面。
- `src/gateway/app.test.ts`：memory 读取与遗忘集成测试。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 329/329 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E114 已提交并推送 Gitee/GitHub。
- 遗留：置顶重要记忆、原始记录（L0）视图、artifact 事件流、终端真实执行通道。
