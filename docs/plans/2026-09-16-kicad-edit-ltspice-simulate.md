# 推进计划：KiCad 编辑与 LTspice 仿真写入链（E413）

> 日期：2026-09-16 · 分支：v0.2b · 状态：完成

## 目标

在只读链之上开放受控写入：KiCad 原理图有界编辑复用项目事务（预检/快照/确认/提交）；LTspice 批仿真经高风险确认后才启动，产物落在沙箱内。默认无确认零写入、零仿真。

## 计划

1. KiCad：有界编辑（`append_annotation` / `replace_text`）→ `ProjectFileChange` → `prepareProjectTransaction`；未确认不落盘。
2. LTspice：`runLtspiceSimulation`（先 `-netlist` 再固定 `-b` 跑同目录 `.net`，可注入 runner）；生成 `.raw/.log` 等仅限原理图同目录且在沙箱内。
3. 领域工作流新增 `kicad_edit` / `ltspice_simulate` 节点（risk=`write`/`simulate`）；统一入口与 mcp-agent 要求显式批准；指纹恢复复用 E412。
4. 配置白名单、confirm 文案风险提示、需求/目录/附录 A/交接同步。

## 验收标准

- 无批准时 KiCad 编辑与 LTspice 仿真均不产生副作用。
- KiCad 编辑必须经项目事务快照；取消不改源文件。
- LTspice 仅允许固定批参数（`-netlist` 预处理 + `-b`）；无确认不 spawn。
- 只读工具行为不变；`npm run build` + 定向单测绿；`doc-lint` 不新增失败。

## 执行过程

### 改动

- 新增 `src/mcp/kicad-edit.ts`（+test）：有界编辑经 `prepareProjectTransaction`/`commitProjectTransaction`。
- 扩展 `ltspice.ts`/`ltspice-server.ts`：`RunSimulation` 固定 `-b`（对 `.asc` 先 `-netlist`）。
- 扩展 `kicad-server.ts`：`EditSchematic`。
- `domain-workflow` / `workflow-entry` / `mcp-agent`：写入与仿真批准门 + E412 指纹。
- `confirm-gate`：`mcp_agent` 风险升为 high；配置示例白名单扩容。
- 文档：需求 §4.1.2 + 附录 A、AGENTS、目录地图、交接。

### 遇到的问题

- 仿真单测需落盘假可执行文件，否则存在性检查先于注入 runner 失败。
- LTspice 24 对 `.asc` 直接 `-b` 在无交互会话常挂起（零 CPU、无产物）；改为先 `-netlist` 再 `-b` `.net` 后业务 LM741 约 2–3s 出 `.raw/.log`。

## 结果

- `npm run build` 绿；ltspice 定向 5/5；业务四条 MCP 调用重跑成功（见业务验收报告）。
- `doc-lint`：不新增失败（既有 C7 provisional 超期保留）。
- E413 收口：受控写入链完成；自由 PCB 编辑与自定义仿真开关不在本轮。
