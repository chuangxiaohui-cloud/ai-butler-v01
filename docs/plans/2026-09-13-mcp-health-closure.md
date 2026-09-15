# MCP 当前健康度收口

## 目标

- 修复本机 `windows-mcp` 与 `StdioMcpClient` 的初始化兼容问题。
- 提供可重复执行的 MCP 健康检查入口，明确区分配置、握手、工具清单与只读调用状态。
- 让现有 3 条真实 MCP 集成测试通过，并修正 S3 / [P-10] 的当前状态记录。

## 非目标

- 不实现 Keil、KiCad 等专业子 Agent。
- 不扩展 MCP 工具白名单，不开放写操作或进程终止。
- 不运行全量 E2E、搜索 bench 或外部 LLM。

## 验收标准

- `windows-mcp` initialize、tools/list、`Process(mode=list)` 均可在健康检查中成功。
- `node --import tsx --test tests/integration/mcp-real-server.test.ts` 为 3/3。
- MCP 客户端新增或更新的定向单测通过，`npm run build` 通过。
- 文档不再把专业子 Agent 或当前 S3 健康度误写为已完成。

## 执行过程

### 改动

- 新增 `src/mcp/health.ts`，健康检查依次验证 initialize/tools/list，并仅在默认工具和默认参数均声明且通过白名单时执行只读调用。
- 新增 `npm run mcp:health`，输出配置数、检查数、跳过项、工具数、分阶段耗时和错误。
- 真实集成测试改为读取 `configs/mcp-agents.json`，不再复制一份可能漂移的启动参数。
- Windows MCP 专属启动窗口从 10 秒调整为 20 秒；全局 [P-57] 不变，工具白名单仍只有 `Process`。
- 新增 2026-09-13 S3 状态校正报告，明确 MCP 工具适配层与专业子 Agent 的边界。

### 遇到的问题

- 前一轮真实测试曾在 initialize 10 秒处超时，本轮首次复验即 3/3 通过，无法复现固定协议错误；健康检查实测 initialize/tools/list 约 5.2 秒，判定为冷启动波动风险，不虚构协议根因。

## 结果

- 验证：`npm run build` 通过；MCP client/config/health 定向单测 12/12。
- 真实检查：`npm run mcp:health` 通过，1/1 server 健康、19 个工具、默认 `Process` 调用成功。
- 集成测试：`tests/integration/mcp-real-server.test.ts` 3/3 通过。
- 文档检查：`git diff --check` 通过；`npm run doc-lint` 的 C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。
- 边界：只恢复并固化 Windows MCP 工具适配健康度；六个专业子 Agent 和真正的任务编排仍未实现。
- 成本：零外部 LLM；未运行全量测试、E2E 或 bench；未提交。
