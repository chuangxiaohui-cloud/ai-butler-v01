# 推进计划：Word/文档转 PDF（E154）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

补齐 `.docx/.doc → PDF` 转换，覆盖“格式转换”里缺失的反向路径。

## 计划

1. 新增 `scripts/office_docx_to_pdf.py`：Word COM `ExportAsFixedFormat` 转 PDF。
2. `office-daily` 新增 `to_pdf` 模式，接收 `.docx/.doc` 输出 PDF。
3. 真跑验证并清理临时文件。

## 执行过程

### 改动

- `scripts/office_docx_to_pdf.py`。
- `src/skills/office-daily/index.ts`、`src/skills/README.md`。

## 结果

- 临时 `.docx` 真跑转 PDF 成功，Word COM 退出异常已做静默容错。
- 验证：全量单测 451/451 + 集成 17/17；doc-lint 通过。
