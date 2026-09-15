# 推进计划：VS Code 只读 MCP 垂直链

> 日期：2026-09-14 · 分支：v0.2b · 状态：已完成

## 目标

把 VS Code 从注册表占位推进为本地只读工作区 MCP：发现工作区、盘点配置与诊断来源，并向 mcp-agent 返回结构化证据。

## 计划

1. 新增 VS Code 工作区适配：沙箱内发现 `.vscode/` / `.code-workspace`，只读解析 tasks、launch、C/C++ 配置和相关 settings。
2. 新增 stdio MCP server，仅暴露 `DiscoverWorkspaces` / `InspectWorkspace`；不启动 VS Code、不执行 task、不写文件。
3. 接入配置白名单与 mcp-agent 自然语言路由/结构化产物。
4. 补定向单测，同步需求、目录、验收和交接记录。

## 验收标准

- 只访问工作区沙箱内已登记的 VS Code 配置文件，拒绝越界和非目录输入。
- JSONC 可解析；损坏配置作为诊断返回，不阻断其他配置盘点。
- task 只输出标签、类型、分组、problemMatcher 和是否声明命令，不回显或执行命令/参数。
- 明确区分 problemMatcher 配置证据与实时编辑器诊断；本轮实时诊断必须标记不可用。
- 主项目 build、目标单测和 `git diff --check` 通过；`doc-lint` 不新增失败。不运行全量测试、集成/E2E 或 bench。

## 执行过程

### 改动

- 新增 VS Code 工作区发现与盘点适配，支持 `.vscode/`、`.code-workspace`、tasks/launch/C/C++/有限 build settings。
- 内置 JSONC 只读解析；单文件损坏形成配置诊断，不阻断其余配置。
- task 摘要隐藏命令与参数，只保留标签、类型、分组、problemMatcher 和命令存在标记；实时诊断明确为未接入。
- 新增本地 stdio MCP server，仅开放 `DiscoverWorkspaces` / `InspectWorkspace`，并接入真实配置白名单。
- mcp-agent 接通自然语言发现/盘点与结构化产物；E404 工作流新增 VS Code `workspace_inventory` 节点。
- 同步需求 §4.1.2/§13、附录 A、目录地图、验收快照与交接账本。

### 遇到的问题

- 首次测试把不存在目录放在沙箱默认根之外，门禁先正确返回“越界”；测试改为 `projects/` 内不存在目录后分别验证越界与不存在语义，生产代码无需修改。
- 仓库既有 `doc-lint` C7 provisional 超期（需求第 19 行）仍在；E405 不扩大范围处理。

## 结果

- `npm run build`：通过。
- 定向测试：29/29（VS Code 适配、mcp-agent、领域工作流、配置、registry）。
- 未运行全量测试、集成/E2E 或 bench；未启动/控制 VS Code，未执行 task 或写配置。
- `git diff --check`：通过；配置示例与本地配置 JSON 解析通过；`doc-lint` C1-C6/C8 通过，仅保留既有 C7 provisional 超期（需求第 19 行，2 FAIL/0 WARN），E405 未新增失败。
