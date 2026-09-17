# 推进计划：硬件审计只读 CLI（E427）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成

## 目标

为 E411 `data/hardware-audit.jsonl` 提供只读查阅 CLI（对齐 `repo:audit`）：倒序、`--limit`、可选 `--action` / `--allowed` 过滤；零硬件动作。

## 计划

1. `src/mcp/hardware-audit-cli.ts` + `scripts/hardware-audit.ts` + `npm run hardware:audit`。
2. 定向单测（空账本、limit、过滤、非法参数）。
3. §4.1.2 / §13 / 附录 A / 交接。

## 验收

- 只读 JSON 出口；不写审计、不触硬件。
- `build` + 定向单测 + `doc-lint` 绿。

## 结果

- 定向单测 **3/3**；冒烟 `hardware:audit --limit 5` → total=0。
- `doc-lint` 0 FAIL 0 WARN。
- **未提交**（按 owner 要求）。
