# 推进计划：成熟度 L2 累积——市场 Skill 沉淀（PDF 速读 / 表格速读 / PDF 压缩，E254）

> 日期：2026-08-27 · 分支：v0.2b · 状态：已完成

## 目标

按 `docs/plans/2026-08-26-maturity-accumulation-path.md` Phase 1.2「每周沉淀 3-5 个市场 Skill」节奏，
把真实高频任务（PDF 速读/关键词命中、xls/xlsx 表格与 BOM 速读、PDF 压缩）固化为可执行市场 Skill
（E250 本地安装 + E251 `@input` 输入通道），用户累积 Skill 8→11，并登记附录 A E254。

## 计划

1. **核心逻辑 `src/skills/market/file-readers.ts`**：`parseInputArgs`（input.txt 按行解析
   [path, ...args]）、`readPdfTextSummary`（复用 `parseDocumentFile`，txt/pdf 通吃）、
   `readTableSummary`（spawn `scripts/office_xls_read.py`，输出 headers/行数/前 5 行/关键词命中）、
   `compressPdf`（spawn `scripts/office_pdf_compress.py`，输出压缩前后体积）；python spawn 经
   可注入 `run` 参数便于单测。
2. **单测 `file-readers.test.ts`**：parseInputArgs 边界、pdf/txt 摘要（临时文件）、table/compress
   注入 fake run 的成败链。
3. **3 个薄 CLI 包装 `scripts/market-*.ts`**：读 @input 文件 → 调核心逻辑 → JSON 输出；失败 exit 1；
   package.json 增 `market:pdf:text` / `market:table:read` / `market:pdf:compress` 脚本。
4. **3 个 Skill manifest**：`configs/market-skills/{pdf-read,table-read,pdf-compress}/manifest.json`
   （command 权限 + input:query + 中文触发词 + verify）；`--source` 本地安装（--yes）。
5. **真实文件验证**：`pdf-read` 用 `dm365_ip_cam_mb_v1_1b.pdf`+关键词；`table-read` 用
   `365IPC_TOTAL_BOM_0307.xls`；`pdf-compress` 用 dm365 PDF → 沙箱输出。
6. **文档**：附录 A 登记 E254（状态/证据/链接）；计划文档补结果；handoff 更新。

**验收标准**

- `npm run maturity:check` 用户累积 Skill 8→11。
- 3 个 Skill 安装成功且 `skill:market:run` 真实验证 ok:true。
- `npm run build` + 单测全绿 + `doc-lint` 0 FAIL 0 WARN。

## 执行过程

### 改动

- `src/skills/market/file-readers.ts`（新）：`extractFilePath` / `parseInputArgs`（从用户 query 提取
  路径——首行即路径 / 单行「路径 关键词」/ 含触发词自然语言均可，支持引号路径/UNC/POSIX；其余词作参数）、
  `readPdfTextSummary`（复用 parseDocumentFile）、`readTableSummary`（office_xls_read.py，[P-112]）、
  `compressPdf`（office_pdf_compress.py，[P-112]）；`defaultRunPython` 候选解释器顺序尝试 + 有界超时。
- `src/skills/market/file-readers.test.ts`（新）：13 条（路径提取 7 + pdf 摘要 2 + 表格 2 + 压缩 2）。
- `scripts/market-pdf-text.ts` / `scripts/market-table-read.ts` / `scripts/market-pdf-compress.ts`（新）：
  薄 CLI 包装，读 @input 文件 → JSON 输出；失败 exit 1。
- `package.json`：新增 `market:pdf:text` / `market:table:read` / `market:pdf:compress` 三个脚本。
- `configs/market-skills/{pdf-read,table-read,pdf-compress}/manifest.json`（新）：command 权限 +
  input:query + 中文触发词（PDF 速读/读 PDF、BOM 速读/表格读取、PDF 压缩 等）+ verify git status。
- 附录 A 登记 E254。

### 遇到的问题

- **本机无 Excel COM**：`office_xls_read.py` 的 COM 路径失败且 xlrd 未装 → 补装 `xlrd`（纯 python
  .xls 读取器，脚本既有回退路径依赖）；`pip install xlrd`（清华源）。
- **npm/cmd shim 截断多行 --query 参数**：Windows 下经 `npm run ... --query "a\nb\nc"` 转发时 argv
  在首个换行处被截断（直接 node 调用正常）——属 Windows 命令行限制；实际 pipeline 走 `run(name,{input})`
  程序化通道不受影响，且新 `parseInputArgs` 支持单行自然语言（含触发词），CLI 多行用法非必需。
- **TS 空值检查**：spawn 的 stdout/stderr 可能为 null → 改用 `?.` 调用。
- **E253 附录 A 插入粘连**：E254 条目插入时缺换行与 E253 同处一行 → 补换行修复。

## 结果

- 验证：3 个 Skill 本地安装（--yes）+ `skill:market:run -- <name> --query "<自然语言>"` 全链 ok:true——
  pdf-read（dm365_ip_cam_lb/pb，DM365 命中）、table-read（365IPC_TOTAL_BOM_0307.xls，rowCount 400、
  DM365 命中 2 行）、pdf-compress（dm365_ip_cam_pb 89293→85053B，pymupdf，输出沙箱）。
- 测试：单测 953/953（新增 13 条）+ 集成 32/32；`npm run build` 通过；`doc-lint` 0 FAIL 0 WARN
  （C8 49 key，附录 564/950）；`maturity:check` 用户累积 Skill 8→11。
- 提交：未提交（等待确认后按单一主题提交）· 推送：待执行（Gitee / GitHub）
- 遗留事项：继续 Phase 1 每周沉淀节奏（下一批可做 BOM 对比/文档互转/表格 OCR 类）；复用率/通过率
  观察继续按累积路径节奏记录。
