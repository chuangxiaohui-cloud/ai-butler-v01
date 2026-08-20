# 推进计划：视频学习增强 ASR 与关键帧（E150）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

在 `video-learner` 字幕链路之外补齐两条内容提取通道：无字幕时下载音频并
ASR 转文字；下载视频后用 ffmpeg 抽关键帧并交给 VLM 描述，把画面信息并入
Skill 生成材料。

## 计划

1. `video-learner` 增加媒体下载、ffmpeg 音频/关键帧提取、ASR 转写适配。
2. ASR 支持 OpenAI 兼容 `/audio/transcriptions` 与本地 `whisper` CLI，
   均未配置时诚实提示。
3. 关键帧描述通过 `callVLM` 生成，字幕、ASR、画面三类材料统一进入 LLM。
4. 补单测、更新 `.env.example` 与 README，登记 E150 并跑全量验证。

## 执行过程

### 改动

- `src/skills/video-learner/index.ts`、`index.test.ts`。
- `src/skills/README.md`、`.env.example`。

## 结果

- `video-learner` 无字幕时下载媒体，ffmpeg 抽取 16k 单声道音频，按
  `WHISPER_API_URL`（OpenAI 兼容 `/audio/transcriptions`）或本地 `whisper` CLI
  顺序尝试 ASR；都不可用时诚实提示。
- 视频下载成功后用场景变化抽关键帧，失败时定间隔兜底，最多
  `VIDEO_LEARN_MAX_FRAMES` 张，再由 `callVLM` 描述并进入 LLM 生成材料。
- 字幕、ASR、关键帧三类材料合并进同一 LLM 请求；回答会标注“音频转文字”和
  “VLM 关键帧”来源。
- 验证：`npm run build` 成功；单测 442/442 + 集成 17/17 全绿；`doc-lint` 通过。
