# 推进计划：真实 flash 驱动（E420）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

在 E411 门禁之上接入**可执行** flash 驱动：门禁通过 → 复算固件摘要 → 仅白名单工具模板 spawn；默认可注入 runner，无 `executeFlash` 仍零烧录。串口写仍禁止。

## 结果

1. 新增 `src/mcp/flash-driver.ts`：`st-flash` / `pyocd` 固定 argv；地址仅 `0x…`；超时 [P-39]。
2. `mcp-agent`：门禁通过且 `executeFlash===true` + `flashExecutable` 时调用驱动；否则只返回门禁说明。
3. 更新硬件门禁文案；§4.1.2 + 附录 A E420；`AGENTS.md` / `code-directory.md`。

## 验收

- 定向单测 32/32（flash-driver 3 + hardware-gate 7 + mcp-agent 含 E420）。
- `npm run build` 绿；`doc-lint` 0 FAIL 0 WARN。
- 未跑全量 `test:all` / 真实硬件；默认无 `executeFlash` 零 spawn。
