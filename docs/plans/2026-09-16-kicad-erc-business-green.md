# 推进计划：LED_Key KiCad ERC 收绿（业务）

> 日期：2026-09-16 · 分支：v0.2b · 状态：完成

## 目标

让业务工程 `M:\projects\EDA\LED_Key\LED_Key.kicad_sch` 的 ERC 在验收口径下 `facts.ok=true`（无 error 级违规）；并修正 MCP 对 KiCad 10 JSON（`sheets[].violations`）的解析缺口。

## 计划

1. 修复 `collectViolations`：汇总 `sheets[].violations`；`ok` 以 `errorCount===0` 为准（警告仍上报，不挡 ok）。
2. 修原理图 21 条 error：悬空标签、未连接引脚（加 no_connect）、电源未驱动（加 PWR_FLAG）。
3. 重跑 `mcp:accept --business-only` 并更新报告/交接。

## 验收标准

- 定向单测覆盖 sheets 解析与 ok 判定。
- 业务 ERC：`facts.ok=true`，`errorCount=0`；源文件仅有意修改。
- [P-10] 仍可能未过（成熟度/doc-lint/回归/签认另论）。

## 结果

- `kicad.test.ts` 5/5；业务重跑：`facts.ok=true`，errorCount=0，warningCount=1078。
- 原理图备份：`LED_Key.kicad_sch.bak-erc`。
- 报告与交接已更新；未提交。
