# 推进计划：服务商设置接真实数据（E111）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

把设置面板“服务商”从 mock 升级为真实数据：列出 DeepSeek/MiniMax/智谱配置状态、
测试连接、设置默认服务商；默认顺序持久化到 `data/provider-order.json`，
registry 运行时读取，无需改 `.env`。

## 计划

1. 新增 `src/config/provider-order.ts`：读写 `data/provider-order.json`。
2. `LlmProviderRegistry` 支持 `order()` / `setOrder()` / `listStatuses()`，
   运行时优先 env，其次配置文件。
3. gateway 新增 `GET /api/providers`、`POST /api/providers/default`、
   `POST /api/providers/test`（严格按 id 查已配置 provider，不泄露密钥）。
4. UI `ProvidersSettings` 拉取真实状态，支持测试连接、设为默认。
5. 补测试、登记需求文档（§13 / 附录 A E111），更新交接，提交推送。

**验收标准**

- `/api/providers` 返回三家状态与默认顺序。
- 未配置/未知 provider 的测试连接返回 `{ ok:false }`，不误触真实 API。
- “设为默认”写入配置文件，registry 顺序随之变化。

## 执行过程

### 改动

- 新增 `src/config/provider-order.ts`。
- `src/search/llm-registry.ts`：`order()` / `setOrder()` / `listStatuses()`。
- `src/gateway/app.ts`：providers 三接口。
- `ui/prototype/src/App.tsx` + `styles.css`：服务商设置真实表格。
- `src/gateway/app.test.ts`：providers 状态与安全失败测试。

### 遇到的问题

- 测试连接最初对未知 provider 会回退到默认第一家并真实调用 API；改为严格按 id
  在已配置列表内查找，未配置直接失败。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 323/323 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E111 已提交并推送 Gitee/GitHub。
- 遗留：Provider 编辑/删除与 API Key 写入 UI、技能库/记忆/Token 计量真实 API、
  artifact 事件流、终端真实执行通道。
