# 推进计划：Token 计量真实数据（E113）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

让 Token 用量成为真实数据：OpenAI 兼容客户端每次调用自动记账到
`data/usage.jsonl`，gateway 提供聚合与预算接口，设置面板展示真实消耗并支持
预算上限设置。

## 计划

1. 新增 `src/usage/usage-store.ts`：记账、读取、按今日/近7天/本月聚合、按模型拆分。
2. 新增 `src/config/usage-budget.ts`：预算上限与降级阈值（P-108）持久化。
3. `OpenAiCompatibleClient` 解析响应 `usage` 自动记账；registry 传入 provider id。
4. gateway 新增 `GET /api/usage/stats`、`POST /api/usage/budget`。
5. UI Token 用量页拉取真实统计，展示模型占比，支持保存预算。
6. 补测试、登记需求文档（§13 / 附录 A E113），更新交接，提交推送。

**验收标准**

- 真实 LLM 调用后 `data/usage.jsonl` 有记录，聚合接口能统计今日/近7天/本月。
- 预算可读写持久化，降级阈值默认 90%（P-108）。
- UI 显示真实 Tokens 与模型占比，不再用 mock ¥。

## 执行过程

### 改动

- 新增 `src/usage/usage-store.ts`、`src/config/usage-budget.ts` 及单测。
- `src/search/llm-client.ts`：响应 usage 自动记账；`llm-registry.ts` 传入 provider。
- `src/gateway/app.ts`：usage 两接口。
- `ui/prototype/src/App.tsx` + `styles.css`：Token 用量真实页面。
- `src/gateway/app.test.ts`：usage stats 形状测试。

### 遇到的问题

- 费用换算需要单价表，当前先只记账 Token 与预算；UI 明确标注“费用换算待配置单价”。

## 结果

- 验证：主项目与 UI `npm run build` 通过；`npm run test:all` 单测 328/328 +
  集成 17/17 全绿；doc-lint 0 FAIL / 0 WARN。
- 提交：E113 已提交并推送 Gitee/GitHub。
- 遗留：单价表与自动降级执行、记忆管理真实 API、artifact 事件流、终端真实执行通道。
