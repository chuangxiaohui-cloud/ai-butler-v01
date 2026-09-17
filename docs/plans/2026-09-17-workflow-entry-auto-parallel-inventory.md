# 推进计划：规划入口自动只读并行组（E432）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

`planMcpWorkflowEntry` 在需要多平台只读盘点时，生成 ≥2 个 `read_only` 盘点节点并自动打上同一 `parallelGroup: 'inventory'`，交给 E431 并行执行。单平台盘点不加组。

## 结果

- 多平台未指定 → `inventory_required` + 双节点同组；可从 capability 补全 Keil `projectPath`。
- 单平台盘点无 `parallelGroup`。
- 定向单测通过；`doc-lint` 绿。
