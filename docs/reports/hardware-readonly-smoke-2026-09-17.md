# 真实硬件只读冒烟报告 · 2026-09-17（E430）

## 环境

- 分支 `v0.2b`；E429 已 push（`f3f785a` → origin-github / origin-gitee）。
- `serialport@13.0.0` 已安装；本机可见 PnP：`CH340(COM3)`、`CP210x(COM4)`、`COM5`、双 `STM32 STLink`；**Status=Unknown**，`Enable-PnpDevice` 拒绝（权限），`SerialPort.list()` = `[]`。
- 本轮**未** `executeFlash`、**未**串口写。

## 步骤与结果

| 步骤 | 结果 |
|------|------|
| `device:auth` 授权 UART-CH340 / UART-CP210x / STLINK-1 | 通过（`data/device-auth.jsonl`） |
| `hardware:gate` serial_read COM3/COM4 | allowed=true，审计已写 |
| `hardware:gate` flash STLINK-1（无摘要） | 诚实拒绝 `missing_firmware_digest` |
| `runAuthorizedSerialRead` + E425 reader 打开 COM3/COM4 | 初跑：`open().then` 崩（v13 回调式 API）→ **已修**；复跑：`Opening COMn: File not found`（设备未真正枚举） |

## 结论

1. 运维链（auth → gate → audit）本机可用。
2. E425 生产绑定已兼容 serialport@13 回调式 `open`/`close`（冒烟发现并修）。
3. **字节级只读成功**仍受阻：COM/ST-Link 为 Unknown/幽灵设备，需插紧/重插或管理员启用驱动后再冒烟。

## 证据目录

`tmp/hardware-smoke-2026-09-17/`（运行时，不入库）
