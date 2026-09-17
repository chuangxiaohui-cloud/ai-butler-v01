# 推进计划：flash 工作流节点（E424）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成

## 目标

统一入口可为烧录生成 `hardware_flash` 计划（指纹 + 高风险批准）；执行走本地门禁+驱动，**工作流批准 ≠ perFlashConfirmed**；串口仍不进工作流。

## 计划

1. `domain-workflow`：新增 `hardware_flash`（risk=`flash`），本地执行而非 MCP dispatch。
2. `workflow-entry`：接受带固件路径的烧录计划；串口继续拒绝。
3. `mcp-agent`：批准恢复后仍须 `perFlashConfirmed`；无 MCP 节点时可零 subAgent 执行。
4. §4.1.2 + 附录 A；定向单测。

## 验收

- 无批准不 ready；批准但无 `perFlashConfirmed` 不 spawn。
- 串口仍 clarification；`build` + 定向单测 + `doc-lint` 绿。

## 结果

- 代码：`domain-workflow` / `workflow-entry` / `mcp-agent` 已接线；工具解析剥离设备字段，避免 `JLINK-1` 误判。
- 定向单测：workflow-entry + domain-workflow + mcp-agent **45/45**。
- 文档：§4.1.2、附录 A、AGENTS、code-directory、交接已更新。
- `doc-lint`：0 FAIL 0 WARN。
- **未提交**；未接真实硬件。
