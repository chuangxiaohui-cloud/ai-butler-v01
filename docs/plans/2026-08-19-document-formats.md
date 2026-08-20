# 推进计划：文档格式识别补齐（E145）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

`office-daily` 的文档排版能力支持 `.docx / .md / .txt / .pdf`；
`.doc` 老格式无解析库时诚实提示另存，不再只认 `.docx`。

## 计划

1. `word_format` 模式按文件类型分发：
   `.docx` → python-docx 排版；`.md/.txt` → 转排版 docx；`.pdf` → 提取文本转 docx。
2. `.doc` 保持诚实提示。
3. 补 Markdown 与 PDF 排版单测。

## 执行过程

### 改动

- `src/skills/office-daily/index.ts`、`src/skills/office-daily/index.test.ts`。

## 结果

- `.docx` 走 python-docx 排版；`.md/.txt` 转排版 docx；`.pdf` 提取文本转 docx。
- `.doc` 老格式诚实提示另存。
- `npm run test:all` 单测 431/431 + 集成 17/17 全绿；`doc-lint` 通过。
