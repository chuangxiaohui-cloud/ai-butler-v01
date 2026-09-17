# 推进计划：设备白名单 CLI（E426）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成

## 目标

为 E411 设备白名单提供与 `repo:whitelist` / `im:gate` 同风格的生产 CLI：list / authorize / revoke；禁止夹具/模型/构建来源；不接真实硬件。

## 计划

1. `DeviceAuthStore` 增 `listCurrent()`（仅当前有效授权）。
2. `src/mcp/device-auth-cli.ts` + `scripts/device-auth.ts` + `npm run device:auth`。
3. 定向单测；§4.1.2 / §13 / 附录 A / 交接。

## 验收

- `--list` / `--authorize` / `--revoke` JSON 出口；禁用来源拒绝。
- 无硬件动作；`build` + 定向单测 + `doc-lint` 绿。

## 结果

- 定向单测 **2/2**；冒烟 `device:auth --list` → count=0。
- `doc-lint` 0 FAIL 0 WARN。
- **未提交**（按 owner 要求）。
