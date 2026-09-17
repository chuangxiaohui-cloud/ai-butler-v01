# 推进计划：openocd 烧录白名单（E422）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

在 E420 flash 驱动上扩展 `openocd` 工具模板：仅固定 `-f` 配置路径形态 + 由驱动拼出的 `program … verify reset exit`；禁止调用方自由 `-c`/任意 TCL。

## 结果

1. `FLASH_TOOL_KINDS` 含 `openocd`；cfg 仅 `interface|target|board/<name>.cfg`。
2. `buildFlashArgs` / `runAuthorizedFlash` / mcp-agent 透传 `openocdCfg` 或 interface+target。
3. §4.1.2 + 附录 A E422；定向单测绿。

## 验收

- flash-driver + mcp-agent 定向 30/30；`doc-lint` 0 FAIL 0 WARN。
- 非法 cfg / 路径注入字符拒绝；未接真实 openocd 硬件。
