# 推进计划：固件摘要只读 CLI（E428）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成

## 目标

为 E411 固件 SHA-256 摘要提供只读 CLI：沙箱内路径算摘要，供烧录门禁使用；不烧录、不连设备。

## 计划

1. `computeFirmwareDigest` 支持可选 `workspaceRoot`。
2. `firmware-digest-cli.ts` + `scripts/firmware-digest.ts` + `npm run firmware:digest`。
3. 定向单测；§4.1.2 / §13 / 附录 A / 交接。

## 验收

- `--path projects/…` 产出 sha256/byteLength；越界/缺失诚实失败。
- `build` + 定向单测 + `doc-lint` 绿；零硬件。

## 结果

- 定向单测 **2/2**；`doc-lint` 0 FAIL 0 WARN。
- **未提交**（暂缓）。
