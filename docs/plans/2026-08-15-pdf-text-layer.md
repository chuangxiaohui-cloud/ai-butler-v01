# 推进计划：Datasheet PDF 全文解析增强

> 日期：2026-08-15 · 分支：v0.2b · 状态：已完成

## 目标

解决当前 `document-parser.ts` 只能匹配 `Tj/TJ` 操作符、遇到 FlateDecode 压缩流/复杂版式的 datasheet PDF 就取不到全文的问题，让二次取证能真正读到 TI/兆易创新等厂商 datasheet 的参数表与引脚表；扫描件先做“无文本层”诚实报错，并预留 OCR 接入点。

## 计划

1. 复测现状：对 `data/datasheets/TPS5430.pdf` 与 `STM32F103C8T6.pdf` 跑当前解析，确认提取为空或仅少量文本。
2. 新增 `scripts/pdf_text.py`：用 PyMuPDF 从 stdin 读 PDF，抽取文本层，返回 JSON（文本、页数、文本页数、是否扫描件）。
3. 改 `src/search/document-parser.ts`：PDF 分支优先调 Python/PyMuPDF，失败回退原 Tj/TJ 提取；无文本层时按“扫描件/无文本层”明确报错。
4. 新增 `npm run pdf:text -- <路径>` 本地验证脚本。
5. 补单测：FlateDecode 压缩流 PDF、空白页 PDF、回退路径；跑 `npm run test:all`。
6. 真实复测 `TPS5430.pdf` / `STM32F103C8T6.pdf`，确认能提取关键参数关键词。
7. 登记 v2.5 附录 A（E82）、更新进度与计划文档，doc-lint，提交推送。

**验收标准**

- TPS5430/STM32F103C8T6 两份真实 datasheet 能提取全文，且命中“TPS5430”“STM32F103C8T6”等关键词。
- 无文本层/扫描件返回明确的“暂不支持 OCR”错误，不再静默返回空。
- 单测全绿，doc-lint 0 FAIL/0 WARN。

## 执行过程

### 改动

- 新增 `scripts/pdf_text.py`：PyMuPDF 从 stdin/文件路径读 PDF，用 `rawdict` 逐 span 重建文本（解决 Identity-H/CID 字体下 `get_text` 返回字形编号的问题），返回 JSON（文本/页数/文本页数/是否扫描件）；stdout 强制 UTF-8，避免 Windows GBK 控制台崩溃。
- `src/search/document-parser.ts`：PDF 分支优先 spawn Python 子进程调 PyMuPDF，失败回退轻量 Tj/TJ + FlateDecode 解压提取；无文本层时按“扫描件/无文本层”明确报错。
- 新增 `npm run pdf:text -- <路径> [关键词]` 本地验证脚本。
- 测试：document-parser 新增 FlateDecode 压缩流提取、无文本层报错 2 条；修复测试 `fakeFile` 对 Buffer 浅拷贝导致底层缓冲残留误判有文本的问题。

### 遇到的问题

- Windows 下 Python stdout 默认 GBK，输出含 `•` 时崩溃；脚本开头 `sys.stdout.reconfigure(encoding='utf-8')`。
- TPS5430 用 `get_text("text")` 对 Identity-H 字体返回 `<hex>` 字形编号；改用 `rawdict` 逐 char 的 `c` 字段重建文本后，正确提取 48,622 字符。
- `STM32F103C8T6.pdf` 实际是从立创下载的认证证书（DNV）而非 datasheet，中文正常提取；非本任务缺陷，但后续应检查 datasheet 下载挑选逻辑。

## 结果

- 验证：`npm run pdf:text -- data/datasheets/TPS5430.pdf TPS5430 500kHz` 提取 48,622 字符/3038 行，命中 `TPS5430`、`500kHz`；STM32 文件为证书 PDF，中文正常提取 1,361 字符。
- 测试：单测 244/244 + 集成 17/17 全绿；doc-lint 0 FAIL/0 WARN。
- 提交：<hash> · 推送：Gitee / GitHub
- 遗留事项：扫描件 OCR（PaddleOCR）仍未接入；`scripts/pdf_text.py` 已返回 `scanned` 标记，下一步可把 PyMuPDF 渲染页图 + PaddleOCR 接入。
