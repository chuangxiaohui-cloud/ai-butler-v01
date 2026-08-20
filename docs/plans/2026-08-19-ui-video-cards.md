# 推进计划：UI 视频卡片区（E147）

> 日期：2026-08-19 · 分支：v0.2b · 状态：已完成

## 目标

三栏 UI 知识咨询栏把后端返回的 `videos` 渲染成视频卡片区，
显示平台、标题和链接，不改变正文回答。

## 计划

1. `Message` 增加 `videos`，`send` 解析后端字段。
2. `MessageItem` 渲染 `.video-cards`。
3. 补 CSS，确保卡片不挤占正文。

## 执行过程

### 改动

- `ui/prototype/src/App.tsx`、`ui/prototype/src/styles.css`。

## 结果

- `Message` 支持 `videos`，`send` 解析后端字段，`MessageItem` 渲染视频卡片。
- `npm --prefix ui/prototype run build` 通过；主项目单测 435/435 + 集成 17/17 全绿。
