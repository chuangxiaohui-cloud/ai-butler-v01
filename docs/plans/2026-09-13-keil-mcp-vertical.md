# Keil MCP 低风险垂直链

## 目标

- 新增 Keil MCP server，提供工作区内 `.uvprojx` 发现与显式编译工具。
- 编译结果解析为 warning/error 诊断，并通过 E389 契约返回 artifact/evidence。
- 接入本机 `D:\Keil_v5\UV4\UV4.exe`，但不越界编译安装目录示例。

## 非目标

- 不烧录、不调试、不修改 `.uvprojx` 或源文件。
- 不扫描白名单外的用户磁盘，不编译 Keil 安装目录自带项目。
- 不引入 LLM、自主规划或新的外部依赖。

## 验收标准

- 发现工具仅返回沙箱根内 `.uvprojx`，越界与 symlink 逃逸拒绝。
- 编译工具只接受现存 `.uvprojx`，使用 `spawn(shell:false)` 调用 UV4，按 [P-38] 超时。
- warning/error、退出码、超时和日志形成结构化结果；不调用 flash 参数。
- mock MCP 全链、Keil 模块定向测试和 TypeScript build 通过。
- 若工作区没有真实工程，明确登记真实固件编译未执行，不虚报通过。

## 执行过程

### 改动

- 新增 `keil.ts`：沙箱内递归发现 `.uvprojx`、固定 UV4 `-b` 命令、[P-38] 超时、编译器/链接器 warning/error 解析。
- 新增 `keil-server.ts`：stdio MCP `DiscoverProjects` / `BuildProject`；无 flash 工具，build 不自动重试。
- MCP client 将 server 的 `isError` 文本写入 error；dispatcher 在失败时也保留 output artifact 和工具调用 evidence。
- `mcp-agent` 支持 Keil/`.uvprojx` 触发：含工程路径时映射 BuildProject，无路径时先走只读 DiscoverProjects；修复 `.uvprojx` 文件名被旧通用工具正则误识别的问题。
- 配置示例新增 Keil；本机配置指向 `D:\Keil_v5\UV4\UV4.exe`。

### 遇到的问题

- 本机 Keil 确认存在，但工作区白名单内没有 `.uvprojx`；安装目录示例位于 `D:\Keil_v5`，编译会在工作区外写产物，因此未越界代跑。
- 首轮用户入口测试把 `demo.uvprojx` 误当成任意 `name.name` 工具引用；显式工具语法收紧为注册表 Agent 前缀后修复。

## 结果

- 验证：`npm run build` 通过；Keil/client/dispatcher/mcp-agent 定向测试 25/25。
- MCP 集成：Windows 既有链 + Keil 工程发现、越界拒绝、编译失败产物保留共 6/6。
- 健康检查：Windows + Keil 2/2；Keil 2 个工具，默认只读发现调用通过。
- 文档检查：`git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仍仅被需求文档第 19 行既有 provisional 超期阻断（2 FAIL / 0 WARN）。
- 真实边界：stdio server 与发现链真实运行；build 使用 mock runner 验证命令和诊断，未在无用户工程的情况下伪造真实固件编译。
- 安全：无 flash 工具、无工程写逻辑、无工作区外扫描；零外部 LLM，未跑全量 E2E/bench，未提交。
