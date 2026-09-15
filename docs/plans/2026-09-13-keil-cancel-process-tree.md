# Keil 取消与超时进程树收口

## 目标

- 将 dispatcher 的 AbortSignal 传入 MCP tools/call，并用标准取消通知传到 Keil server。
- Keil build 在用户取消或 [P-38] 超时时终止 UV4 进程树并返回明确状态。
- 保持 Windows MCP 和不支持取消的 server 兼容。

## 非目标

- 不开放烧录、调试或工程写入工具。
- 不编译工作区外的 Keil 示例工程。
- 不增加新的超时参数或外部依赖。

## 验收标准

- 调用前取消、运行中取消、编译超时分别返回 cancelled/timedOut，且只结算一次。
- Windows 上进程树终止使用 `taskkill /PID <pid> /T /F` 的 argv 调用，不经过 shell；其他平台终止直接子进程。
- MCP 客户端发送 `notifications/cancelled`，Keil server 能按 requestId 中止对应 build。
- Keil/client/dispatcher 定向测试与 MCP 集成通过；真实工程缺失时明确登记未做真实 build。

## 执行过程

### 改动

- `McpClient.callTool()` 接受 `AbortSignal`；运行中取消与调用超时都会按原 requestId 发送 `notifications/cancelled`，并在本地只结算一次。
- dispatcher 将调用方信号透传到 MCP client；远端确认取消后统一返回 `status=cancelled`、结构化 failure、进度事件与 handoff。
- Keil server 按 requestId 保存活动 `AbortController`，收到取消通知后只中止对应 `BuildProject`。
- Keil runner 在 Windows 使用无 shell 的 `taskkill.exe /PID <pid> /T /F` 收口 UV4 进程树，并用直接 kill 兜底；[P-38] 超时复用同一终止路径。POSIX 使用独立进程组终止。

### 遇到的问题

- 首版 Windows 终止逻辑异步启动 `taskkill` 后立即 `unref()`，真实进程树测试中父进程的 close 事件未返回，测试悬挂。
- 改为同步等待有界的 `taskkill`（最长 5 秒），随后直接终止父进程兜底；复验父子进程均退出，取消结果稳定返回。

## 结果

- `npm run build`：通过。
- 定向单测：client + dispatcher + Keil + mcp-agent 共 30/30 通过；包含取消通知、运行中取消契约、Windows 真实父子进程树和 [P-38] 超时。
- MCP 集成：Windows + Keil 现有真实 server 链 6/6 通过；`npm run mcp:health` 2/2 健康。
- `projects/`、`sandbox/`、`outputs/` 内仍无 `.uvprojx`，因此未执行真实固件 build；未触碰工作区外 Keil 示例，也未开放 flash。
- `git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。
- 未运行全量 E2E/bench，零外部 LLM，未提交。
