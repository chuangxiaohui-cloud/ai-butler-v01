# 推进计划：串口只读驱动（E421）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

在 E411 串口只读门禁之上接入**可执行**只读驱动：门禁通过 → 端口名/波特率白名单 → 仅注入 `SerialReader` 才读字节；无 `executeSerialRead` 仍零打开。写/发字节继续硬拒绝。

## 结果

1. 新增 `src/mcp/serial-driver.ts`：端口正则、波特率白名单、`maxBytes` 上界；默认可注入 reader（默认拒绝打开，不引 `serialport`）。
2. `mcp-agent`：门禁通过且 `executeSerialRead===true` + `port` 时调用驱动。
3. 更新门禁文案；§4.1.2 + 附录 A E421；`AGENTS.md` / `code-directory.md`。

## 验收

- 定向单测 37/37（含 serial-driver 3 + mcp-agent E421）。
- `npm run build` 绿；`doc-lint` 0 FAIL 0 WARN。
- 未跑全量 `test:all` / 真实串口；默认无 `executeSerialRead` 零打开。
