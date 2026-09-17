# 推进计划：LTspice 批仿真可选开关白名单（E419）

> 日期：2026-09-17 · 分支：v0.2b · 状态：**已完成**

## 目标

在固定 `-netlist` → `-b` 批仿真之上，允许**显式、有限**的额外批开关（白名单），拒绝任意自定义开关/路径参数；默认行为不变；仍须高风险确认。

## 执行

- `LTSPICE_BATCH_FLAG_WHITELIST` = `-ascii` / `-alt`；`normalizeLtspiceBatchFlags`。
- `runLtspiceSimulation({ extraBatchFlags })` → `['-b', ...flags, netPath]`。
- MCP / 工作流问句「开关：-ascii」透传；非法开关澄清、不 spawn。

## 结果

| 项 | 结果 |
|----|------|
| build / 定向单测 / doc-lint | 通过 |
| 提交 | 待你说「提交」 |

## 未做

- 任意自定义仿真参数；真实 flash 驱动；自由布线 PCB。
