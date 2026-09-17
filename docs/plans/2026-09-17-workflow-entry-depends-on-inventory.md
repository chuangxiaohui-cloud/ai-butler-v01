# 推进计划：规划入口多节点盘点改 dependsOn（E436）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

多平台只读盘点（原 E432 `parallelGroup: inventory`）改为 E435 `dependsOn` 表达：对等盘点节点显式 `dependsOn: []`（DAG 根），由拓扑首波并行；单平台仍不加依赖字段。

## 结果

- 空 `dependsOn` 合法并启用 DAG；多平台盘点打 `dependsOn: []`，不再写 `parallelGroup`。
- workflow-entry / domain-workflow 定向单测覆盖；指纹纳入空数组。
