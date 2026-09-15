# 推进计划：MCP 领域工作流最小执行契约

> 日期：2026-09-14 · 分支：v0.2b · 状态：已完成

## 目标

把 E400 的动态工作流规格和 E401 的 [P-154] 守卫接成一个最小可执行入口；本轮只允许 Keil 项目画像盘点与构建节点。

## 计划

1. 定义节点输入/输出、负责 Agent、工具、文件范围、风险、验收与失败回退的结构化契约。
2. 新增顺序执行器：严格限制 `keil.InspectProjectProfile` / `keil.BuildProject`，复用现有 dispatcher，汇总 artifact/evidence/handoff。
3. 在进入含 build 的修订轮前调用 [P-154] 守卫；超限零工具调用并人工接管。
4. 补定向单测，同步需求、目录、验收和交接记录。

## 验收标准

- 合法的“只读盘点→Keil build”按顺序执行并保留逐节点状态、结构化产物和 MCP 调用证据。
- 节点工具与 kind 不匹配、越出本轮白名单或上游失败时不得继续调用下游。
- `completedRevisionCycles` 达 [P-154] 时，在任何工具调用前熔断并返回 `serial_log/recent_diff` 人工接管要求。
- 主项目 build、目标单测与 `git diff --check` 通过；`doc-lint` 不新增失败。不运行全量测试、集成/E2E 或 bench。

## 执行过程

### 改动

- 新增领域节点/计划/结果契约，节点显式包含输入引用、产物类型、负责 Agent、工具参数、目标文件、风险、验收与失败回退。
- 新增串行执行器，严格限制 Keil 画像盘点与 build 两种 kind/tool 映射，复用现有 dispatcher 且 build 不自动重试。
- MCP 输出被包装为带 nodeId、产物种类、原文与解析数据的 untrusted artifact；工具调用证据同步绑定 nodeId。
- 上游失败立即停止并跳过后续节点；含 build 的工作流在入口调用 [P-154]，超限零工具调用并人工接管。
- 同步需求 §4.1.2/§13、附录 A、目录地图、验收快照与交接账本。

### 遇到的问题

- 首次构建发现执行态节点的推导类型未包含可选 `error`；改为显式使用结果契约中的节点类型，未扩大接口。
- 仓库既有 `doc-lint` C7 provisional 超期（需求第 19 行）仍在；E404 不扩大范围处理。

## 结果

- `npm run build`：通过。
- 定向测试：18/18（领域工作流、[P-154] 守卫、dispatcher）。
- 未运行全量测试、集成/E2E 或 bench；未调用真实 MCP、build、flash 或串口。
- `git diff --check`：通过；`doc-lint`：C1-C6/C8 通过，仅保留既有 C7 provisional 超期（需求第 19 行，2 FAIL/0 WARN），E404 未新增失败。
