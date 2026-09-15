# 推进计划：KiCad ERC 与 LTspice 只读 MCP 链

> 日期：2026-09-14 · 分支：v0.2b · 状态：完成（未提交）

## 目标

完成 E409：接入 KiCad 工程发现/只读盘点/ERC 诊断与 LTspice 原理图发现/只读盘点，输出结构化 untrusted 证据；不编辑工程、不改仿真参数、不启动 LTspice GUI。

## 计划

1. 新增 KiCad 适配器与 stdio MCP：发现 `.kicad_pro/.kicad_sch`，只读盘点工程；ERC 固定调用 `kicad-cli sch erc`，报告只写临时目录并读取后清理。
2. 新增 LTspice 适配器与 stdio MCP：发现 `.asc`，只读提取元件、模型引用、仿真指令和可证实的配置诊断，不运行仿真。
3. 接入 registry、本地配置、mcp-agent 与领域工作流白名单，所有路径复用沙箱检查，结果保持 untrusted。
4. 补适配器、server 路由、Skill/工作流/配置定向测试，同步需求、目录、验收与交接记录。

## 验收标准

- KiCad/LTspice 只访问沙箱内允许的工程文件；符号链接与越界路径拒绝。
- KiCad ERC 参数固定、无 shell、输入文件不修改；报告只存在于临时目录，结构化返回 warning/error/exclusion 与退出状态。
- LTspice 只解析已有 `.asc` 文本，不启动 GUI、不生成 `.raw/.log/.net`、不写 `.asc`。
- MCP 白名单只开放已实现工具；无可执行文件时 ERC 诚实失败，不能把安装探测当 ERC 成功。
- `npm run build`、相关定向测试、配置 JSON、`git diff --check` 通过；`doc-lint` 不新增失败。不运行全量、集成/E2E、bench 或真实工程 ERC/仿真。

## 执行过程

### 改动

- 新增 `kicad.ts` / `kicad-server.ts`：沙箱内发现工程、只读结构盘点、固定 `kicad-cli sch erc`、临时 JSON 报告清理与源文件摘要校验。
- 新增 `ltspice.ts` / `ltspice-server.ts`：发现并只读解析 UTF-8/UTF-16 `.asc`，输出元件、实例、模型引用和已有仿真指令，明确 `simulationExecuted=false`。
- mcp-agent、领域工作流、配置示例与本机配置接入 KiCad `eda` 和 LTspice `simulation` 白名单；结构化输出保持 untrusted。
- 同步需求 §4.1.2/§13/附录 A、目录地图与交接记录。

### 遇到的问题

- 本机已发现 KiCad 华秋版与 LTspice。直接探测 `kicad-cli sch erc --help` 时，程序尝试在用户 Documents 下初始化 KiCad 目录并因当前权限失败；因此本轮没有把该探测当 ERC 成功，也没有提升权限或执行真实工程 ERC。
- Exa 搜索后端未配置，命令语义改由 KiCad 官方 CLI 文档核验；实现采用官方 `sch erc`、`--output`、`--format`、severity 与违规退出码参数。

## 结果

- `npm run build`：通过。
- E409 定向单测：32/32 通过（KiCad、LTspice、领域工作流、registry、mcp-agent）。
- 两个 stdio server 的 `tools/list` 冒烟通过：KiCad 仅列出 3 个白名单工具，LTspice 仅列出 2 个白名单工具。
- 配置 JSON 与 `git diff --check` 通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（第 19 行，2 FAIL/0 WARN），本轮未新增失败。
- 未运行全量测试、集成/E2E、bench、真实工程 ERC 或 LTspice 仿真；未提交。
