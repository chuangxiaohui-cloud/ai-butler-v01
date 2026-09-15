# 专业子 Agent 运行契约

## 目标

- 让 `SubAgentDispatcher` 保留并返回原始任务，不再丢弃 `task`。
- 为每次调度统一产出计划、进度、产物、证据、失败、取消与人工接管信息。
- 保持现有 MCP 工具白名单、重试、降级和调用行为兼容。

## 非目标

- 不接入 Keil、KiCad 或其他专业软件。
- 不实现 LLM 自主规划，不把任务文本隐式注入未知 MCP 工具参数。
- 不开放新的 MCP 工具或写权限。

## 验收标准

- 成功、失败、无 Agent、白名单拒绝、超时、降级和取消均返回同一结构化契约。
- `task.description` 与调用方输入一致；进度回调可观察计划、执行及终态。
- 成功结果包含文本产物和 MCP 调用证据；失败/取消包含明确 failure 与 handoff。
- dispatcher 与 mcp-agent 定向测试、TypeScript build 通过。

## 执行过程

### 改动

- 新增 `src/mcp/contract.ts`，定义统一 task、plan、progress、artifact、evidence、failure 与 handoff 类型。
- `SubAgentDispatcher` 保留原始任务并为选择 Agent、白名单校验、工具执行三个阶段维护计划状态。
- 新增 `onProgress` 观察入口；观察方异常被隔离，不改变实际任务结果。
- 每次真实工具尝试写入 MCP 证据；成功输出形成 untrusted 文本产物，失败/超时/取消形成结构化 failure 与人工接管建议。

### 遇到的问题

- 现有 MCP 工具参数各不相同，不能安全地把自然语言 `task` 隐式塞入未知参数；本轮保留任务并建立执行契约，具体任务参数映射留给 Keil 等专业适配器显式实现。
- 当前 MCP 客户端不能安全中止已经发出的 stdio 请求；本轮维持既有语义，只保证调用前和重试间取消，不伪报进程内调用已被终止。

## 结果

- 验证：`npm run build` 通过；dispatcher + mcp-agent 定向测试 14/14。
- 真实验证：Windows MCP 集成 3/3，成功链额外校验任务保留、计划完成、产物、证据和无需接管。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。
- 安全：未新增工具、参数或权限；所有 MCP 产物和证据继续标记 untrusted。
- 边界：这是专业子 Agent 的运行协议，不是专业能力本身；Keil/KiCad 等仍未接入。
- 成本：零外部 LLM；未运行全量测试、E2E 或 bench；未提交。
