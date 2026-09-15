# 推进计划：MCP 统一工作流入口与构建审批

> 日期：2026-09-14 · 分支：v0.2b · 状态：已完成

## 目标

完成 E408：领域任务经统一入口生成白名单工作流，优先读取项目画像；缺失或过期时只盘点/澄清，画像就绪后构建必须先经用户批准，并继续受 [P-154] 约束。

## 计划

1. 新增统一入口规划器，解析 Keil/STM32-GCC 构建请求并只生成 E404 白名单节点。
2. 规划器优先调用 `loadForPlanning`；画像缺失、动作能力缺失或过期时仅返回盘点节点，不把猜测命令写入计划。
3. 把构建预检接入共享 pipeline 审批门；批准恢复时向 mcp-agent 传递一次性批准标记，再由既有领域执行器运行。
4. 补统一入口、mcp-agent 与 pipeline 定向测试，同步需求、目录与交接记录。

## 验收标准

- 新鲜画像可生成唯一、白名单内的 Keil 或 STM32-GCC build 节点，工具参数只来自画像结构化引用。
- 缓存缺失/过期时零 build 调用，只执行只读盘点；平台不明确或多能力冲突时澄清，不猜。
- 未批准时零 build 调用；批准恢复后仍先过 [P-154]，不开放 flash/serial。
- `npm run build`、相关定向测试、`git diff --check` 通过；`doc-lint` 不新增失败。不运行全量、集成/E2E 或 bench。

## 执行过程

### 改动

- 新增 `src/mcp/workflow-entry.ts`：识别 Keil/STM32-GCC 构建任务，按工程根读取画像，并只生成 E404 白名单节点。
- 画像缺失、过期或 build 能力未取证时仅生成 `InspectProjectProfile`；多平台请求未选平台时返回澄清。
- `mcp-agent` 改走统一规划与领域执行器；未批准只展示计划，批准后才调用 build，盘点仍保持只读。
- pipeline 在画像就绪时建立可恢复裁决，确认文案展示 Agent、工具与风险；工程路径使用原始查询，避免预处理丢失。
- STM32-GCC/Keil 构建词已补入本地 MCP 路由；`SkillDeps.projectProfiles` 支持生产缺省 store 与测试隔离注入。

### 遇到的问题

- 原 pipeline 会清洗 Windows 工程路径，且“Keil”裸词未落到 operate；已仅对 mcp-agent 保留原始 query，并补齐 Keil/STM32-GCC 本地工具特征。
- 旧行为“有 `.uvprojx` 就直接 build”与画像先行冲突；测试改为画像缺失先盘点、画像就绪后批准再构建。
- `doc-lint` 仍有开工前已存在的 C7 provisional 超期（需求第 19 行，2 FAIL/0 WARN）；本轮不扩大治理范围。

## 结果

- `npm run build`：通过。
- 统一入口/领域工作流/mcp-agent/审批门核心测试：25/25；pipeline MCP 定向测试：2/2；router-v2 回归：86/86。
- `git diff --check`：通过。
- `doc-lint`：C1-C6/C8 通过，仅保留既有 C7 的 2 FAIL/0 WARN。
- 未运行全量测试、集成/E2E、bench 或真实 MCP/build/flash/串口；未提交。
