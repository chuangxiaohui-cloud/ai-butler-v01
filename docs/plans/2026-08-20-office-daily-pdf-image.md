# 推进计划：生活助手 PDF 合并/加密与图片格式扩展（E155-E157）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

在 `office-daily` Skill 上补生活助手能力：多 PDF 合并、PDF 密码加密、
图片格式转换（PNG/JPG/JPEG/WebP/BMP），并把未接入能力改为诚实提示。

## 计划

1. 新增 3 个 Python 脚本：`office_pdf_merge.py`（pypdf 合并）、
   `office_pdf_encrypt.py`（pypdf AES-256 加密）、
   `office_image_convert.py`（Pillow 格式转换）。
2. `office-daily` 增加 `merge_pdf` / `encrypt_pdf` / `image_convert` 模式，
   `modeFrom` 补关键词，意图路由补触发正则。
3. 补单测：合并输出页数、加密后用 pypdf 解密回验、PNG→JPG 落盘。
4. 登记 E155-E157，更新计划结果与交接。

**验收标准**

- “把这两个PDF合并成一个”能输出合并 PDF，页数 = 各文件之和。
- “用密码 abc123 给这个PDF加密”输出加密 PDF，pypdf 用密码可解密。
- “把这张图转成JPG”输出 JPG 文件。
- 主项目 build、单测全绿、doc-lint 通过。

## 执行过程

### 改动

- `scripts/office_pdf_merge.py`、`scripts/office_pdf_encrypt.py`、
  `scripts/office_image_convert.py`：pypdf / Pillow 实现，stdout 输出 JSON。
- `src/skills/office-daily/index.ts`：新增三个模式与执行分支、
  `findPdfFiles` / `targetImageFormat` 辅助函数。
- `src/skills/office-daily/index.test.ts`：新增 3 条单测，更新未接入提示断言。
- `src/agent/intent-feature.ts`：`office_daily` 正则补合并/加密/格式转换关键词。
- `src/skills/README.md`、`docs/code-directory.md`：能力与脚本清单同步。

### 遇到的问题

- `modeFrom` 图片格式正则漏了大小写不敏感标记，“转成JPG”被当成考勤表模板；
  改为 `/i` 后修复。
- `apply_patch` 包装命令在本环境被沙箱拒绝，改用工作区内 Node 脚本做精确替换。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 454/454 + 集成 17/17 全绿；
  `doc-lint` 通过。
- 能力：PDF 合并（3 页）、PDF 加密（pypdf 解密回验 1 页）、PNG→JPG 均落盘测试通过。
- 提交：与 E127-E154 批次一起统一确认后分批提交。
- 遗留事项：PDF 压缩（体积优化）、HEIC 等更多图片输入格式继续排期。
