# 推进计划：表格格式识别补齐（E144）

> 日期：2026-08-19 · 分支：v0.2b · 状态：执行中

## 目标

`office-daily` 占比分析支持常见表格格式：`.csv`、`.xlsx`、`.xlsm`；
`.xls` 老格式继续诚实提示，不再把“表格”误限成单一格式。

## 计划

1. `isSpreadsheet` / `findXlsxFile` 匹配 `.xlsx`、`.xlsm`、`.xls`。
2. `office_xlsx_read.py` 确认 openpyxl 可读 `.xlsm`。
3. 补 `.xlsm` 单测，保留 CSV/xlsx 测试。

## 执行过程

### 改动

- `src/skills/office-daily/index.ts`、`src/skills/office-daily/index.test.ts`。

## 结果

- 待补。
