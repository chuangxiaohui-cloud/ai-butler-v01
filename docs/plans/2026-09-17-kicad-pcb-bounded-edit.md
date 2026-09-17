# 推进计划：KiCad PCB 有界编辑（E418）

> 日期：2026-09-17 · 分支：v0.2b · 状态：**已完成**

## 目标

在 E413 原理图有界编辑之上，开放 **PCB（`.kicad_pcb`）同等有界写**：追加丝印注解 / 单次精确替换；经项目事务快照与高风险确认；**不开放自由布线/任意改铜皮**。

## 执行

- `kicad-edit.ts`：共享有界编辑；PCB 用 `gr_text` + `F.SilkS`。
- `EditPcb` MCP 工具；`kicad_pcb_edit` 工作流节点；入口/mcp-agent/白名单接线。
- §4.1.2 + 附录 A E418 + AGENTS；定向单测 + doc-lint。

## 结果

| 项 | 结果 |
|----|------|
| `build` | 通过 |
| kicad-edit + workflow-entry 定向 | 通过 |
| `doc-lint` | 0 FAIL 0 WARN |
| 提交 | 待你说「提交」 |

## 未做

- 自由布线 / 任意改铜；自定义仿真开关；真实 flash 驱动。
- 本轮未把 `bench:v02a` 报表一并提交（可另批）。
