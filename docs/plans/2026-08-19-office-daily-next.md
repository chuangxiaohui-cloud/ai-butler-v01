# 推进计划：生活助手办公日常第二批（E138）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

在 `office-daily` Skill 上补第二批能力：xlsx 原生解析分析、Word 格式排版、
PDF→Word 转换、项目汇报 PPT 生成。使用本地可用的 Python 库
（openpyxl / python-docx / python-pptx）。

## 计划

1. 新增 4 个 Python 脚本：xlsx 读取、docx 排版、docx 写入、pptx 生成。
2. `office-daily` 增加 `xlsx_analyze` / `word_format` / `pdf_to_word` / `pptx` 模式。
3. 支持 `OFFICE_PYTHON` 环境变量指定 Python，默认回退 `python`/`python3`。
4. 补单测：xlsx 占比、docx 排版、PDF 文本转 Word、PPT 文件生成。
5. 登记 E138，更新计划结果与交接。

**验收标准**

- `.xlsx` 上传后能算出部门占比，不再要求另存 CSV。
- `.docx` 上传后能输出排版副本。
- PDF 上传后能输出对应 Word 文档。
- “做一份项目汇报PPT”能生成 `.pptx`。
- 主项目 build、单测全绿、doc-lint 通过。

## 执行过程

### 改动

- `scripts/office_xlsx_read.py`、`scripts/office_docx_format.py`、
  `scripts/office_docx_write.py`、`scripts/office_pptx_create.py`。
- `src/skills/office-daily/index.ts` + 测试。

### 遇到的问题

- Windows 下 Python 脚本 stdout 默认非 UTF-8，中文会乱码；已强制 `sys.stdout.reconfigure(encoding='utf-8')`。
- 系统 Python 缺少 openpyxl/python-docx/python-pptx；运行时通过 `OFFICE_PYTHON` 指定带依赖的解释器。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 419/419 + 集成 17/17 全绿；
  `doc-lint` 通过。
- 能力：xlsx 原生占比、Word 排版副本、PDF→Word、项目汇报 PPT 均已落盘测试通过。
- 提交：未提交（延续工作区待统一确认批次）。
- 遗留事项：主动提醒、.xls 老格式原生读取、PPT 主题定制继续排期。
