# 推进计划：gateway 开发期 CORS 白名单（E341）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次）

## 目标

owner 实测：打开 Vite UI（5173）提问提示「网关未连接」，打开 gateway（8787）却正常。根因：gateway 未配置任何 CORS 响应头，5173 页面跨端口访问 8787 的 `/api/*` 被浏览器跨域拦截；UI 兜底把一切失败统一显示成「网关未连接」（误导）。本项给 gateway 加**开发期 CORS 白名单**，让 5173 Vite UI 能直连 8787。

## 计划

1. `src/gateway/app.ts` 在 dev 模式（未设置 `GATEWAY_AUTH_TOKEN`）下新增 CORS 中间件：Origin 命中白名单（`http://127.0.0.1:5173` / `http://localhost:5173`）时回 `Access-Control-Allow-*` 头，OPTIONS 预检直接 204；白名单外与生产模式（带 token）不回任何跨域头 → verify：定向单测断言头与状态码。
2. `src/gateway/app.test.ts` 补 2 条：dev 模式白名单放行（预检 204 + 响应带 ACAO、非白名单源无 ACAO）；生产模式不回 ACAO → verify：`npm run build` + `node --test dist/gateway/app.test.js`。
3. 文档登记：`docs/plans/2026-09-05-gateway-cors.md`（本文件）、需求文档附录 A CHANGELOG 增 E341、当日 handoff 会话备注订正 → verify：`npm run doc-lint` 0 FAIL 0 WARN。

**验收标准**

- 5173 UI 提问能拿到真实回复（不再显示「网关未连接」本地兜底）。
- 生产模式（设置 `GATEWAY_AUTH_TOKEN`）下 API 不带跨域头，CORS 白名单不泄露到生产。

## 执行过程

### 改动

- `src/gateway/app.ts`：`createGatewayApp` 内新增 `DEV_UI_ORIGINS` 白名单 + `corsWhitelist` 中间件（`app.use` 注册于全部路由之前）；未设置 `GATEWAY_AUTH_TOKEN`（dev 模式）才生效，白名单命中回 `Access-Control-Allow-Origin/Methods/Headers/Max-Age` 与 `Vary: Origin`，`OPTIONS` 直接 `204` 短路；非白名单 Origin 或带 token（生产）一律 `next()` 不放跨域头。
- `src/gateway/app.test.ts`：新增 2 条——E341 dev 模式（OPTIONS `/api/ask` 预检 204 + ACAO=origin + Allow-Methods 含 POST；GET `/api/health` 带 `127.0.0.1:5173` / `localhost:5173` 回 ACAO；`http://evil.example` 无 ACAO）；E341 生产模式（设 `GATEWAY_AUTH_TOKEN` 后同源带 Origin 请求无 ACAO，finally 还原 env）。

### 遇到的问题

- 无。设计取舍：白名单只允许 Vite dev 两个 Origin，绑定 token 存在与否区分 dev/生产，避免引入新配置面。

## 结果

- 验证：`npm run build` 绿；`node --test dist/gateway/app.test.js` 33/33 全绿（含新增 2 条）。
- 测试：单测 gateway 33/33（新增 E341 白名单放行 1 + 生产不回 ACAO 1）；集成未跑（成本纪律）。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——两终端（`npm run gateway` + `npm --prefix ui/prototype run dev`）打开 `http://127.0.0.1:5173` 提问应得真实回复、网络面板无 CORS 红条。
