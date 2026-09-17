# 推进计划：真实工程构建/ERC/仿真验收与 [P-10] 差距复验（E414）

> 日期：2026-09-16 · 分支：v0.2b · 状态：完成

## 目标

建立可复核的 MCP 动作验收入口：区分夹具与用户真实业务工程，在显式确认后分别执行构建/ERC/仿真；汇总证据并重跑 [P-10] 差距判定。无真实业务工程时诚实记录缺口，不得虚报通过。

## 计划

1. 新增验收契约与清单（fixture / business），支持 dry-run 与 `--confirm` 执行。
2. 实现 `mcp:accept`：对清单目标调用白名单工具，只保留摘要证据（SHA-256/字节数/退出事实）。
3. 本轮：发现业务工程（若无则记录缺口）；对夹具尝试受控执行并出报告；重跑 `maturity:check` 更新 [P-10] 五条件表。
4. 同步需求边界、附录 A、目录与交接。

## 验收标准

- 清单明确标注 `fixture` vs `business`；夹具成功 ≠ 业务验收。
- 无 `--confirm` 时零构建/ERC/仿真副作用。
- 报告含 [P-10] 五条件最新差距；不因夹具绿而宣称 [P-10] 通过。
- `npm run build` + 定向单测绿；`doc-lint` 不新增失败。

## 执行过程

### 改动

- 新增 `src/mcp/acceptance.ts`（+test）、`scripts/mcp-s3-acceptance.ts`、`npm run mcp:accept`。
- 本机 `configs/mcp-agents.json` 补入 E413 工具白名单（`EditSchematic` / `RunSimulation`）。
- 报告：`docs/reports/mcp-s3-acceptance-2026-09-16.md`。
- 需求 §4.1.2 + 附录 A、AGENTS、目录地图、交接。

### 遇到的问题

- 工作区无用户业务工程 → 以 `--allow-fixture-only` 做夹具对照，明确不签认业务验收。
- STM32 夹具缺 CMake cache → 诚实失败。
- LTspice 批仿真达 [P-38] 超时 → 诚实失败，不虚报成功。

## 结果

- `build` 绿；acceptance 4/4；夹具：Keil ✅、KiCad ERC 已执行、STM32 ❌、LTspice ❌。
- `maturity:check` = L1；`doc-lint` 仅既有 C7；**[P-10] 未通过**。
