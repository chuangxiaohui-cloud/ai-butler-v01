# 推进计划：领域工作流只读并行组（E431）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

在 `executeDomainWorkflow` 上支持相邻只读节点的 `parallelGroup`：同组 `Promise.all` 并行，组间仍串行。禁止 build/write/simulate/flash 进并行组（对齐 §11 写锁）。

## 计划

1. 节点可选 `parallelGroup`；校验只读 + 同组连续。
2. 执行器按「串行波次 / 并行波次」调度；任一同组失败则后续节点 `skipped`。
3. 定向单测 + §4.1.2 / 附录 A / 交接。

## 验收

- Keil 盘点 + VS Code 盘点同组可并行；含 build 的并行组拒绝。
- 无 parallelGroup 时行为与串行一致。
- `build` + 定向单测 + `doc-lint` 绿。

## 结果

- 实现：`partitionWaves` + 校验；指纹纳入 `parallelGroup`。
- 单测：domain-workflow 12/12（含并发峰值=2、失败短路）。
- 文档：§4.1.2 / 附录 A / AGENTS / code-directory / 交接已更新；`doc-lint` 0 FAIL 0 WARN。
- 待办：用户说「提交」再 commit。
