# 推进计划：图片类 Skill VLM 推理预算修复（E351，2026-09-05）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成

## 背景与目标

owner 粘贴截图问「分析图片内容？」，回复为 `知识咨询 ⚠️ 置信度仅 0.200…系统在处理您的请求时遇到了一点小问题，请稍后再试。`。定位结论（真实复现 + 直连探测，¥0）：

- 图片附件确实到达 pipeline（route-cases：`hasImage:true`、`attachmentTypes:["image/png"]`），路由正确命中 `R_IMAGE_GENERAL → image_analysis`，**不是模型非多模态、也不是 UI 丢图**。
- 根因：`DEEPSEEK_VISION_MODEL=deepseek-v4-flash-vision-exp` 是**推理型视觉模型**——思考写在 `reasoning_content`，正式答案才落 `message.content`。image-analysis/color-recognition 调用只给 `maxTokens: 200/100`，token 全被思考耗光（实测 `finish_reason=length`、`reasoning_tokens=200`、`content=""`）→ `createVisionClient` 报「VLM 返回空内容」→ skill 兜底 0.2。
- 验证：同一张图 `max_tokens=1000` → 推理 548 tokens 后 `content` 正常返回（准确描述），`finish_reason=stop`；耗时 ~8.8s > VLM 默认 8s 超时，需同步放宽。

## 计划

1. `src/config/params.ts` 新增两参数并在 §5 注册（PARAM_IDS 同步）：
   - `vlmImageMaxTokens = 2048`（[P-152]，推理思考+答案共享预算，替代 image-analysis 200 / color-recognition 200/100）
   - `vlmTimeoutMs = 20_000`（[P-153]，`createVisionClient` 默认单次超时，替代硬编码 8000）
2. `src/skills/image-analysis/index.ts`：VLM 调用 `maxTokens` 200 → `PARAMS.vlmImageMaxTokens`。
3. `src/skills/color-recognition/index.ts`：两处 `maxTokens`（200/100）→ `PARAMS.vlmImageMaxTokens`。
4. `src/search/llm.ts` `createVisionClient`：默认超时 `VLM_TIMEOUT_MS ?? 8000` → `VLM_TIMEOUT_MS ?? PARAMS.vlmTimeoutMs`（env 可继续覆盖）。
5. 补单测：新增 `image-analysis/index.test.ts` 与 `color-recognition/index.test.ts`——成功路径断言调用 VLM 时 `maxTokens === PARAMS.vlmImageMaxTokens`（防退回 200 回归）+ 无图 need_image 0.2 + VLM 抛错兜底 0.2。
6. 文档：需求文档 §5 增 P-152/P-153 行 + 附录 A E351（`bench:na(new-param)`）；本计划结果；`docs/2026-09-05-progress-handoff.md` 加 E351 小节与链接。
7. 验证：`npm run build` → 定向单测 → `npm run doc-lint` 0 FAIL 0 WARN；全量 test:all / bench 与真实 UI 冒烟不自主跑（成本纪律，留给 owner）。

**验收标准**

- `npm run build` 绿；image-analysis 3/3 + color-recognition 3/3 新增单测绿 + 受影响既有测试回归绿；`npm run doc-lint` 0 FAIL 0 WARN（参数计数 151→153）。
- 真实复验路径（owner 手动）：重启 gateway 后粘贴截图问「分析图片内容？」→ 不再回 0.2 兜底，正常给出图片描述。

## 执行过程

### 改动

- `src/config/params.ts`：新增 [P-152] `vlmImageMaxTokens=2048` 与 [P-153] `vlmTimeoutMs=20000`，PARAMS + PARAM_IDS 同步。
- `src/skills/image-analysis/index.ts`：VLM 调用 `maxTokens` 200 → `PARAMS.vlmImageMaxTokens`。
- `src/skills/color-recognition/index.ts`：两处 `maxTokens`（200/100）→ `PARAMS.vlmImageMaxTokens`。
- `src/search/llm.ts`：`createVisionClient` 默认超时 `VLM_TIMEOUT_MS ?? 8000` → `VLM_TIMEOUT_MS ?? PARAMS.vlmTimeoutMs`（env 仍可覆盖）。
- 新增 `src/skills/image-analysis/index.test.ts`、`src/skills/color-recognition/index.test.ts`：无图 need_image 0.2 / 成功路径断言 VLM 调用按 [P-152] 走 / VLM 抛错兜底 0.2。
- 文档：需求文档 §5 增 P-152/P-153 行 + 附录 A E351；`docs/2026-09-05-progress-handoff.md` 增 E351 小节与手动复验第 13 项；本计划结果。

### 遇到的问题

- doc-lint C3：§5 加两行后非空行 171 > 预算 170——合并 §5.1 登记纪律第 4/5 条为一行（内容不变），回收 1 行后通过。
- 附录 A 插入 E351：目标行（E350 段落）单行超长，apply_patch 行锚点匹配失败——改用 Node 按标题索引精确拼接插入（UTF-8、保留 LF），成功后 doc-lint 通过。

## 结果

- 验证：`npm run build` 绿（tsc）；`npm run doc-lint` 0 FAIL 0 WARN（PARAM 计数 151→153）。
- 测试：image-analysis 3/3 + color-recognition 3/3 新增单测绿；registry 4/4 回归绿；真实 VLM 定位探测（owner 截图）已在开工前完成：`max_tokens=1000` → reasoning 548 后 content 正常、`finish_reason=stop`（~8.8s）。
- 提交：未提交（并入现有未提交批次 E335–E351，待 owner 拍板）。
- 遗留：video-learner 帧描述 VLM 预算（120/1200）同款隐患另立小轮；owner 手动复验 E351（见今日交接第 13 项）：重启 gateway 后 5173 粘贴截图问「分析图片内容？」应正常返回描述、「提取主色/色号」应出颜色结果。
