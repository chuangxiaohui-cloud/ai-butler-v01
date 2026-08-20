# 推进计划：生活助手 PDF 压缩与图片输入扩展（E158-E159）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

在 `office-daily` Skill 上补生活助手能力：PDF 压缩/体积优化，
以及图片输入格式扩展（HEIC/HEIF 尽力解码、AVIF、TIFF）。

## 计划

1. 新增 `office_pdf_compress.py`：PyMuPDF 无损优化（garbage/deflate），
   缺失时回退 pypdf `compress_identical_objects`；支持目标 KB 提示。
2. 图片输入扩展：`findImageFile` 增加 heic/heif/tiff/avif；
   `office_image_convert.py` 与 `compress_image.py` 增加 HEIC 尽力解码链
   （pillow-heif → imagecodecs → ffmpeg），均不可用时诚实提示；
   AVIF/TIFF 由 Pillow 原生支持。
3. 补单测：PDF 压缩页数保留、AVIF→PNG、HEIC 无解码器诚实提示。
4. 登记 E158-E159，更新计划结果与交接。

**验收标准**

- “把这个PDF压缩一下”输出有效 PDF，页数不变，报告前后体积与方法。
- “把这张图转成PNG”对 AVIF 输入能成功落盘。
- HEIC 输入在无解码器环境返回诚实提示，不报错崩溃。
- 主项目 build、单测全绿、doc-lint 通过。

## 执行过程

### 改动

- `scripts/office_pdf_compress.py`：PyMuPDF 无损优化 + pypdf 去重回退。
- `scripts/office_image_convert.py`：新增 `decode_heic` 尽力解码链，
  HEIC/HEIF 输入先解码再转换。
- `scripts/compress_image.py`：HEIC/HEIF 输入走同一解码链后再压缩。
- `src/skills/office-daily/index.ts`：新增 `pdf_compress` 模式与执行分支，
  `findImageFile` 扩展 heic/heif/tiff/avif。
- `src/agent/intent-feature.ts`：`office_daily` 正则补压缩/HEIC/AVIF 关键词。
- `src/skills/office-daily/index.test.ts`：新增 3 条单测。

### 遇到的问题

- 本机 ffmpeg（essentials 版）无 libheif 解码器，且 Python 环境无
  pillow-heif/imagecodecs，HEIC 无法真实解码；落地为“尽力解码链 +
  诚实提示”，并把 Pillow 原生支持的 AVIF/TIFF 作为实际可用扩展。
- pypdf 6.10 无 `replace_image`/`compress_content_streams`，图片重编码
  压缩留待后续（需要 PyMuPDF 渲染或新版 pypdf）。

## 结果

- 验证：`npm run build` 通过；`npm run test:all` 单测 457/457 + 集成 17/17 全绿；
  `doc-lint` 通过。
- 能力：PDF 压缩（pypdf 兜底 2655→2224 字节样例，页数保留）、AVIF→PNG、
  HEIC 诚实提示均测试通过。
- 提交：与上一批次分开，单独提交 E158-E159。
- 遗留事项：图片型 PDF 的降采样/图片重编码压缩（需 PyMuPDF 渲染）继续排期。

## E160 增量（图片型 PDF 降采样压缩）

- 目标：用户指定体积目标（如“压缩到 200KB”）且无损不足时，对图片型 PDF
  按 120/90/60 DPI 递减重渲染 + JPEG 重编码，直到达标或最低 DPI。
- 实现：`office_pdf_compress.py` 增加 `render_compress`；仅在显式给出
  max_kb 且 PyMuPDF 可用时启用；结果带 `render`/`dpi` 与“文字不可选择”
  诚实提示；`office-daily` 的 `pdf_compress` 分支透出 note。
- 验证：单测 457/457 通过 + 1 条 fitz 特性门控用例按环境跳过 + 集成 17/17；
  真跑图片型 PDF 234KB→193KB（DPI 120，达标 200KB），页数保留。
- 遗留：无 PyMuPDF 环境仅能无损优化（诚实提示），已在脚本内兜底。
