# 推进计划：dfu-util / jlink 烧录白名单（E423）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

在 E420/E422 flash 驱动上扩展 `dfu-util` 与 `jlink`：固定 argv；禁止自由脚本/任意 `-c`；jlink 的 CommanderScript 仅由驱动生成。

## 结果

1. `FLASH_TOOL_KINDS` 含 `dfu-util`、`jlink`。
2. dfu-util：`-a <alt> [-s addr:leave] -D <fw>`；jlink：设备/接口/速度白名单 + 驱动写临时 `loadfile…exit` 脚本。
3. mcp-agent 透传；§4.1.2 + 附录 A；定向单测绿。

## 验收

- flash-driver + mcp-agent 定向 33/33；`doc-lint` 0 FAIL 0 WARN。
- §11.1.3 所列 `openocd`/`st-flash`/`dfu-util`/`jlink` 模板已齐（外加 `pyocd`）。
