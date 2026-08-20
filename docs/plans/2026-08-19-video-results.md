# 推进计划：搜索结果附带视频（E146）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

知识问答（how_to/experience 类）在搜索引擎已返回视频结果时，把 B站/YouTube/抖音
视频链接结构化输出，并追加到文字答案后的“相关视频教程”区块；不主动强塞视频。

## 计划

1. 新增 `src/search/videos.ts`：识别视频 URL 并按平台归类。
2. `pipeline` 从最终证据提取 `videos`，追加答案区块，并返回 `videos` 字段。
3. 补单测：识别平台、答案包含视频区块、无视频不变。

## 执行过程

### 改动

- `src/search/videos.ts` + 测试、`src/search/pipeline.ts`、`pipeline.test.ts`。

## 结果

- `pipeline` 从最终证据提取 B站/YouTube/抖音视频，返回 `videos` 字段并追加答案区块。
- `npm run test:all` 单测 435/435 + 集成 17/17 全绿；`doc-lint` 通过。
