# 推进计划：PDF 原理图 BOM 坐标感知（E152 Week 1-3）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成（Week 3 完成）

## 目标

按用户确认的三周路线推进：Week 1 先落地 PyMuPDF 坐标提取 + 符号包围盒检测，
在 DM365 电源页（`POWER_RTC_AIC12`）跑通单页，为 Week 2 最近邻绑定打基础。

## 计划

1. 新增 `scripts/pdf_symbols.py`：提取每页单词坐标、字号，并对文本/绘图矩形做
   空间聚类，输出候选符号包围盒。
2. 新增 `npm run pdf:symbols` CLI，支持指定 PDF 与页码。
3. 在 DM365 主板电源页跑通，记录单词数、文本簇数、绘图簇数、位号候选数。
4. 登记 E152，Week 2 继续做最近邻绑定与三层过滤。

## 执行过程

### 改动

- `scripts/pdf_symbols.py`、`scripts/pdf-symbols.ts`、`package.json`。

## 结果

- `scripts/pdf_symbols.py` 可提取每页单词坐标、字号，并对文本/绘图矩形做空间聚类；
  `npm run pdf:symbols -- <PDF> <页码>` 可查看候选包围盒。
- DM365 主板电源页 `POWER_RTC_AIC12`（第 2 页）跑通：
  721 个单词、70 个文本候选包围盒、其中 35 个含位号。
- 电源板 `SYSTEM POWER`（第 2 页）对照：294 个单词、38 个文本候选包围盒、
  其中 8 个含位号。
- 新增 `scripts/bom_reference.py` 与 `scripts/bom-compare.ts`，把
  `365IPC_TOTAL_BOM_0307.xls` 导出为 `data/bom-reference.json` 并对照：
  MAIN 363 个位号 / POE 194 个 / LENS 52 个；当前纯文本解析的位号召回率
  MB 99.7%、PB 100%、LB 100%，精度 68.3% / 86.2% / 70.3%。
- 缺位号仅 `C118`（MB）；多余位号主要是 DDR 引脚名和 BOM Change 备注噪声。
- 遗留：矢量绘图聚类仍会被连线带偏（当前 `drawingSymbols=0`），Week 2 改为
  文本簇 + 位号/值最近邻绑定，并用三层过滤排除 DDR 引脚名噪声。

## Week 2 结果

- 新增 `src/skills/schematic-bom/coordinates.ts`：位号最近邻绑定值/封装/型号，
  三层过滤包括 BOM Change 小字号备注、值证据距离、密集引脚区噪声。
- 坐标解析已接入 `schematic-bom` Skill，坐标结果为空时回退纯文本解析。
- XLS 对照指标（坐标版）：MB 召回 95.3% / 精度 72.4%；PB 召回 95.4% /
  精度 93.0%；LB 召回 92.3% / 精度 90.6%。相比纯文本精度 68.3% / 86.2% /
  70.3%，PB/LB 精度明显提升，MB 仍受 DDR 引脚残留影响，留待 Week 3 调参。

## Week 3 结果

- 修复跨页坐标混淆：最近邻绑定改为按页计算，MB 精度从 72.4% 提升到 92.7%。
- 新增 `src/skills/schematic-bom/changes.ts`：解析 `Delete / Add / BOM change to /
  -->` 备注并合并进最终 BOM，已接入 Skill。
- 最终 XLS 对照（坐标 + BOM Change）：MB 召回 94.5% / 精度 83.1%；PB 召回
  93.8% / 精度 92.9%；LB 召回 92.3% / 精度 85.7%。
- 验证：`npm run build` 成功；单测 451/451 + 集成 17/17 全绿；`doc-lint` 通过。
