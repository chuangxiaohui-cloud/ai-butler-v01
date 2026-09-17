# 推进计划：硬件门禁预检 CLI（E429）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（已提交）

## 目标

提供只读门禁预检：`evaluateHardwareGate` 输出允许/拒绝理由；可选算固件摘要；**不** `executeFlash` / 不打开串口。默认写入审计；`--no-audit` 可静默预览。

## 计划

1. `src/mcp/hardware-gate-cli.ts` + `scripts/hardware-gate.ts` + `npm run hardware:gate`。
2. 定向单测（缺设备、缺摘要、serial_read 通过、`--no-audit`）。
3. §4.1.2 / §13 / 附录 A / 交接。

## 验收

- flash/serial_read 参数齐全时可 allowed；缺项诚实拒绝。
- 零硬件动作；`build` + 定向单测 + `doc-lint` 绿。

## 结果

- 实现：`runHardwareGateCli`；flash 可带 `--path`/`--per-flash-confirmed`；默认审计、`--no-audit` 静默。
- 单测：`hardware-gate-cli` 3/3；`doc-lint` 0 FAIL 0 WARN；`test:all` 绿。
- 文档：§4.1.2 / §13 / 附录 A / AGENTS / code-directory / 交接已更新。
