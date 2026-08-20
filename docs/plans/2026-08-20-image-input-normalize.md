# 推进计划：图片理解输入归一化与扩展识别（E161）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

让 agent 图片理解链路（VLM）支持 AVIF/WebP/TIFF/HEIC 等更广泛输入：
- 附件 type 缺失或为 `application/octet-stream` 时，按扩展名兜底识别为图片，路由 `hasImage` 生效；
- 非标准 VLM 输入格式（AVIF/TIFF/HEIC/HEIF/BMP）先归一化为 PNG 再送 VLM，解码不可用时诚实降级。

## 计划

1. `multimodal-preprocessor.ts`：新增 `isImageFile` / `effectiveMime`（扩展名兜底），
   `preprocessUserMessage` 与 `maybeFastDescribe` 改用它；`toDataUrl` 对非安全图片格式
   用 `scripts/office_image_convert.py`（OFFICE_PYTHON → python/python3，15s 超时）转 PNG，
   失败回退原样透传。
2. `image-analysis` / `color-recognition` 的 `firstImage` 同步改用扩展名兜底。
3. 新增 `multimodal-preprocessor.test.ts`：分类兜底、PNG 透传、TIFF/AVIF→PNG、
   HEIC 解码不可用降级。
4. 登记附录 A（E161，压缩旧条目控预算）、更新 plan 结果与 handoff；跑 build/test/doc-lint。

**验收标准**

- 单测新增 ≥4 条全绿，集成 17/17 不变；doc-lint 0 FAIL 0 WARN；
- `.heic`/`.avif` 附件在 type=octet-stream 时仍识别为图片并路由到图片 Skill。

## 执行过程

### 改动

- src/agent/multimodal-preprocessor.ts：新增 IMAGE_EXT_MIME/isImageFile/effectiveMime，
  preprocessUserMessage 与 maybeFastDescribe 改用扩展名兜底；toDataUrl 对非安全图片格式
  用 office_image_convert.py 尽力转 PNG（OFFICE_PYTHON → python/python3，15s 超时），失败回退原样透传。
- src/skills/image-analysis/index.ts、src/skills/color-recognition/index.ts：firstImage 改用 isImageFile。
- src/agent/multimodal-preprocessor.test.ts：新增 7 条单测。

### 遇到的问题

- `??` 与 `||` 混用触发 TS5076，加括号修正；PowerShell 转义问题改用临时 .cjs 脚本做字符串替换（apply_patch 在本沙箱被拒）。

## 结果

- 验证：npm run build 通过；doc-lint 0 FAIL 0 WARN（附录 944/950）；TIFF/AVIF 真解码转 PNG、HEIC 解码不可用降级。
- 测试：单测 464/464 通过 + 1 条 fitz 门控跳过 + 集成 17/17。
- 提交：待用户提交（沙箱禁止写 .git，提权被审核服务配置错误拒绝）。
- 遗留事项：HEIC 在无 pillow-heif/imagecodecs/ffmpeg 环境仍诚实降级；后续可评估 WebP 也归一化以兼容更多视觉端点。
