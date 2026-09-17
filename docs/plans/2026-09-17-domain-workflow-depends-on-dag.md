# 推进计划：领域工作流有界依赖 DAG（E435）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

在 E431 `parallelGroup` 之上，为节点增加可选 `dependsOn`（节点 id 依赖边），按拓扑波次调度；仍禁止并行写/构建/仿真/烧录，禁止任意自由 DAG（环、与 parallelGroup 混用）。

## 结果

- `dependsOn` + Kahn 波次 + `blocked` 级联已落地；指纹纳入排序后的依赖边。
- 定向单测覆盖菱形并行、环/未知依赖、同波写拒绝、混用 parallelGroup、失败级联。
- 规划入口仍可用 parallelGroup；尚未批量改写为 dependsOn。
