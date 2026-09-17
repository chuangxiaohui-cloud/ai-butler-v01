# 推进计划：盘点后平台消歧 UX（E433）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

多平台并行盘点（E432）返回时，附带结构化 `platformChoices`，供 UI/mcp-agent 展示「选 Keil 或 STM32-GCC 再构建」；单平台不加。

## 计划

1. `McpWorkflowEntryResult` 增可选 `platformChoices` + `formatPlatformChoices`。
2. 多节点 inventory 计划自动填充 choices；mcp-agent `followUpAction` 引用之。
3. 定向单测 + 文档。

## 验收

- 双平台 inventory_required 含 2 条 choices；单平台无。
- `build` + 定向单测 + `doc-lint` 绿。

## 结果

- `platformChoices` / `formatPlatformChoices` 已落地；mcp-agent `inventory_required` 完成后优先展示平台选择文案。
- workflow-entry 定向单测覆盖双平台有 choices、单平台无。
- 需求 §4.1.2 + 附录 A E433 已登记。
