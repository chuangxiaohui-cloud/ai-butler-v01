# 推进计划：真实硬件只读冒烟（E430）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（已提交）

## 目标

在本机真实 USB 串口/调试器上做**只读**冒烟：`device:auth` → `hardware:gate` → `executeSerialRead`（E425 serialport）。**不烧录、不串口写**。

## 计划

1. 探测 COM/ST-Link 与 `serialport` 可用性。
2. 授权设备白名单；门禁预检 flash/serial_read。
3. 对可用 COM 做短时只读打开；记录诚实成功/失败。
4. 证据报告 + 交接；不自动 flash。

## 验收

- 有端口时：打开成功或 OS 级诚实失败均可作为证据。
- 全程零 `executeFlash`、零串口写。

## 结果

- Push：`f3f785a` → origin-github / origin-gitee。
- 冒烟中发现并修复 E425：`serialport@13` 回调式 `open`/`close`（定向单测 4/4）。
- auth/gate/audit 绿；真实打开 COM3/COM4 → `File not found`（PnP Unknown）。
- 报告：`docs/reports/hardware-readonly-smoke-2026-09-17.md`。
