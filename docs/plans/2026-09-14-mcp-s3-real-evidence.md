# 推进计划：MCP S3 真实协议证据与差距验收

> 日期：2026-09-14 · 分支：v0.2b · 状态：完成（未提交）

## 目标

完成 E410：为已配置 MCP 子 Agent 采集可复核的 initialize、tools/list 与白名单只读调用证据；使用最小工程夹具验证 Keil、VS Code、STM32-GCC、KiCad、LTspice 的真实 stdio 链路，并据 [P-10] 给出“不夸大”的差距结论。

## 计划

1. 增强健康检查证据字段：显式记录握手是否通过、server 声明工具名、验证级别、只读调用输出摘要与 untrusted 标记，不保存原始敏感输出。
2. 在 `projects/e410-mcp-evidence/` 建立最小只读夹具，覆盖 `.uvprojx`、VS Code 配置、STM32-GCC/CMake、KiCad、LTspice；不包含 build/flash/serial 动作。
3. 更新本机 MCP 配置中的真实 VS Code/CMake 路径，运行 `mcp:health` 采集真实 stdio 证据，再对专业工具执行显式只读盘点。
4. 形成 E410 验收报告并同步需求、目录和交接记录。

## 验收标准

- 每个配置成功的 Agent 都留下 initialize、tools/list 与只读默认调用证据；输出只保存 SHA-256 摘要/字节数并标记 untrusted。
- 专业工具夹具只读调用返回可核验的工程类型与结构信息，不运行 build、ERC、LTspice 仿真、VS Code task、flash 或串口。
- 区分“真实 stdio 协议已验证”“最小夹具已验证”“用户真实业务工程未验证”；不得据此宣称 [P-10] 已通过。
- 只运行 build、相关单测、只读 MCP 冒烟、配置 JSON、`git diff --check` 与 `doc-lint`；不运行全量、集成/E2E 或 bench。

## 执行过程

### 改动

- `health.ts` 增加 initialize、工具名、验证级别、成功输出 SHA-256/字节数和 untrusted 证据；失败不生成成功摘要。
- 新增 `npm run mcp:evidence`，对五类专业最小夹具执行真实 stdio tools/list 与只读盘点，并只输出摘要事实。
- 本机配置补入真实 VS Code 与 STM32CubeCLT CMake 路径；Keil、KiCad、LTspice 既有真实路径复核存在。
- 新增独立证据报告并同步需求、目录、验收差距与进度交接。

### 遇到的问题

- 全局 `mcp:health` 中 Windows MCP initialize 在 20016ms 超时；本轮没有修改 [P-57]、没有重复重试，也没有跨模块诊断。
- 工作区没有用户业务工程，因此按交接允许范围建立最小夹具；证据报告明确禁止把夹具成功解释为用户真实工程验收。

## 结果

- 五个专业 Agent 的真实 stdio 只读证据 5/5 通过；均有工具清单、输出摘要与 `untrusted=true`。
- `mcp:health`：Keil、VS Code、STM32-GCC、KiCad、LTspice 通过；Windows initialize 超时，整体 `ok=false`。
- `maturity:check`：L1；[P-10] 条件③未达 L2+。
- build 通过；health 定向单测 5/5；配置 JSON 与 `git diff --check` 通过。
- `doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（第 19 行，2 FAIL/0 WARN），本轮未新增失败。
- 未运行全量、集成/E2E、bench、真实 build/ERC/仿真、flash 或串口；未提交。
