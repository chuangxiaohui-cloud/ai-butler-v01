# 推进计划：flash/串口能力与风险契约（E411）

> 日期：2026-09-15 · 分支：v0.2b · 状态：已完成

## 目标

落地 flash/串口的能力与风险契约：设备标识白名单、端口占用检查接口、固件摘要、逐次人工门、取消/超时与审计证据；**不连接设备、不执行烧录、不向串口发送字节**。默认无设备授权即零硬件动作；E410 夹具证据不得自动授权硬件。

## 计划

1. 新增硬件能力契约与设备授权账本（append-only）：设备 ID 白名单、撤销、查询。
2. 新增硬件门：flash 必须「设备已授权 + 固件摘要就绪 + 本次独立确认」；串口默认只读，写/发字节一律拒绝。
3. 端口占用检查以可注入探针形式存在；默认探针不打开真实端口，返回 `probe_disabled`。
4. 审计 JSONL 记录每次门禁结果（含拒绝原因）；取消/超时语义写入契约字段（本轮无真实硬件进程）。
5. 接入 mcp-agent / 工作流入口：识别烧录/串口意图后只走门禁与说明，不生成 flash 执行节点、不调 MCP flash 工具。
6. 同步需求 §4.1.2 边界、目录地图、附录 A E411、当日交接。

## 验收标准

- 无设备授权时 `evaluateHardwareGate(flash|serial_write)` 一律拒绝，零副作用。
- 已授权设备但未带「本次 flash 确认」仍拒绝；上次 build 批准 / E410 证据不能继承。
- 串口默认 `read_only`；`write`/`send` 未获显式确认即拒绝（本轮即使确认也硬拒绝发送）。
- 固件摘要为本地文件 SHA-256，不触发烧录。
- 默认端口探针不打开 COM/tty 设备。
- `npm run build` + 定向单测绿；`doc-lint` 不新增失败（既有 C7 可保留）。

## 执行过程

### 改动

- 新增 `src/mcp/hardware-capability.ts`、`device-auth.ts`、`hardware-gate.ts`、`firmware-digest.ts`、`port-probe.ts`、`hardware-audit.ts` 与 `hardware-gate.test.ts`。
- `workflow-entry.ts` 拒绝 flash/串口计划；`mcp-agent` 优先返回门禁说明；`SkillDeps.deviceAuth` 可注入。
- 需求 §4.1.2 / 附录 A E411、AGENTS / code-directory / directory-structure、`docs/2026-09-15-progress-handoff.md` 已同步。

### 遇到的问题

- `sandbox` 导出名为 `isPathAllowed`（非 `checkSandboxPath`），固件摘要改走该 API。
- 硬件门禁不依赖 MCP server：mcp-agent 将烧录/串口检查置于 `subAgent` 空检查之前。

## 结果

- `npm run build`：通过。
- 定向：hardware-gate + workflow-entry 12/12；mcp-agent（含 E411）29/29。
- `doc-lint`：C1-C6/C8 通过，仅保留既有 C7 的 2 FAIL/0 WARN。
- 未运行全量、集成/E2E、bench 或真实硬件；未提交。
