# 推进计划：多图批量 OCR（E167）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

`office-daily` 图片 OCR 支持一次识别多张附件图片：单次初始化 OCR 引擎批量处理，
输出合并文本（按图分段）并落盘 txt，逐图报错、部分失败诚实提示；单图链路保持不变。

## 计划

1. `scripts/office_image_ocr.py`：新增 `--batch <out-txt> <img1> [img2 ...]` 模式，
   引擎只初始化一次，逐图解码/识别并收集 `images[]`/`errors[]`，输出统一
   `{ok, text, chars, images, errors}`；单图模式输出形状保持一致。
2. `office-daily`：新增 `findImageFiles`（复用单图判定谓词）；`image_ocr` 分支
   ≥2 张图走批量链路（逐张写临时文件 → `--batch` → 合并 txt 落盘），
   结果文案带“成功 n/总数、未识别 m 张（原因）”。
3. 测试：批量引擎不可用诚实提示、批量真识别（HAS_LOCAL_RAPIDOCR 门控）、
   单张损坏仍返回其余结果；单图既有用例回归。
4. 登记附录 A（E167）、更新 plan/handoff/skills README；跑 build/test/doc-lint。

**验收标准**

- 单测新增 ≥2 条全绿（真识别按环境门控），集成 17/17 不变；doc-lint 0 FAIL 0 WARN；
- 两张图片“识别这两张图的文字”输出合并文本含两段内容，落盘 txt 存在。

## 执行过程

### 改动

- `scripts/office_image_ocr.py`：`--batch` 模式（单次引擎初始化，逐图异常收集进
  `errors[]`，不中断批次；HEIC 解码链复用），单图链路输出形状不变。
- `src/skills/office-daily/index.ts`：新增 `findImageFiles`；`image_ocr` 分支
  ≥2 张走批量：写临时文件 → `--batch` → 合并 txt（`=== 文件名 ===` 分段）落盘，
  返回 `imageCount`/`errors`，文案“已批量识别 n/总数 张图片（共 N 字）…未识别 m 张（原因）”。
- 测试：`office-daily/index.test.ts` +3。

### 遇到的问题

- `PDF_OCR=0` 时脚本退出码非 0，`runPython` 回退候选后整体 reject，走 catch 的通用
  “图片文字识别失败”文案（与 E164 单图一致）：测试按实际行为断言，不改动 runPython 全局语义。

## 结果

- 验证：`npm run build` 通过；office-daily 定向 34 通过 + 1 条 fitz 门控跳过；`npm run test` 491/491 + 1 跳过；`npm run test:integration` 17/17；`doc-lint` 0 FAIL 0 WARN。
- 测试：单测 491/491 + 1 门控跳过 + 集成 17/17
- 提交：待提交（用户手动 git add + commit）
- 遗留事项：表格结构识别、真实日历/邮件服务接入评估、UI 集成新能力。
