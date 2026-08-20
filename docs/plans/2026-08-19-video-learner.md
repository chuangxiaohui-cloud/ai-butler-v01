# 推进计划：视频学习转 Skill（E148）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

实现“给视频链接 → 提取字幕 → LLM 结构化理解 → 生成 Skill 定义并落盘”的第一版。
优先用字幕，无字幕时诚实要求提供文字稿。

## 计划

1. 新增 `src/skills/video-learner/`：URL 解析、yt-dlp 字幕下载、SRT/VTT 清洗、
   LLM 生成 Skill JSON，落盘 `data/learned-videos/`。
2. 新增 `learn_video` 意图与 `R_LEARN_VIDEO` 路由。
3. 注册 Skill、README、测试计数。
4. 补单测：URL/字幕清洗/LLM 生成/无字幕诚实降级。

## 执行过程

### 改动

- `src/skills/video-learner/index.ts` + 测试。
- `src/agent/intent-feature.ts`、`routing-table.ts`、`executors.ts`、`registry.ts` 等。

## 结果

- `video-learner` 可提取 URL、上传字幕/文字稿，yt-dlp 下载字幕，LLM 生成 Skill JSON。
- `npm run test:all` 单测 440/440 + 集成 17/17 全绿；`doc-lint` 通过。
