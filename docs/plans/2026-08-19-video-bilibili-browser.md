# 推进计划：B站浏览器会话兜底（E151）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

B站风控对 yt-dlp 返回 412 时，`video-learner` 不再依赖 yt-dlp，
改用浏览器会话直连 B站 API 拉取播放流、字幕与媒体文件，继续走
ASR / 关键帧 / LLM 生成链路。

## 计划

1. `SkillDeps` 增加可选 `browserSession`，pipeline 注入。
2. `video-learner` 增加 B站 BV 解析、view/player/playurl API 与媒体下载。
3. `BrowserFetcher.downloadFile` 支持请求头透传，媒体流带 Referer。
4. 补单测，默认浏览器会话优先使用本机 Edge。

## 执行过程

### 改动

- `src/skills/deps.ts`、`src/search/pipeline.ts`、`src/skills/video-learner/`。
- `src/browser/session.ts`、`src/search/search-loop.ts`、`src/skills/README.md`。

## 结果

- `video-learner` 对 B站 URL 自动走浏览器会话：字幕接口、playurl 播放流、
  音频/视频下载全部可用；媒体请求带 `Referer: https://www.bilibili.com`。
- 真跑验证：QQ 登录态下 `player/wbi/v2` 稳定返回字幕，字幕 JSON 下载成功；
  ffmpeg 媒体下载正常，最终生成 Skill JSON 并自动写入 ExperienceManager。
- 验证：`npm run build` 成功；单测 446/446 + 集成 17/17 全绿；`doc-lint` 通过。
