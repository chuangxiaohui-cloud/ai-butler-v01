# 推进计划：办公日常老格式原生读取（E153）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

补齐 `.xls/.xlsb` 与 `.doc` 老格式：二进制表格占比分析直接读取，`.doc` 排版
先读文本再转 `.docx`，不再要求用户手动另存。

## 计划

1. 新增 `scripts/office_xls_read.py`：Excel COM 读取第一张表（支持 `.xls/.xlsb`），xlrd 兜底。
2. 新增 `scripts/office_doc_read.py`：Word COM 读取 `.doc` 文本。
3. `office-daily` analyze 分支支持 `.xls/.xlsb`，word_format 分支支持 `.doc`。
4. 更新测试与文档，真跑验证两种老格式。

## 执行过程

### 改动

- `scripts/office_xls_read.py`、`scripts/office_doc_read.py`。
- `src/skills/office-daily/index.ts`、`index.test.ts`、`src/skills/README.md`。

## 结果

- `.xls` 真跑 `365IPC_TOTAL_BOM_0307.xls` 读取成功（Excel COM）。
- `.xlsb` 用 Excel COM 生成临时工作簿并读取成功，随后清理。
- `.doc` 用 Word COM 生成临时文档并读取成功，随后清理。
- 验证：office-daily 单测 16/16；全量单测 451/451 + 集成 17/17；doc-lint 通过。
