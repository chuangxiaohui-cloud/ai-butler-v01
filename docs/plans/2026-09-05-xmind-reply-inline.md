# 推进计划：思维导图以 AI 回复方式内嵌聊天（E348）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

owner 反馈：E347「中间大窗口」显示成一张图片不是想要的，希望「以问题回复方式显示」——即问完问题、AI 回复里直接内嵌可视化思维导图，随对话走，而不是弹层/图片。方案：聊天消息正文里凡出现 `.xmind` 产物路径（批准生成后的执行回执/读回回复），自动在消息气泡内嵌「思维导图卡片」（自适应缩小整图），保留导图/大纲切换与放大入口。

## 计划

1. `src/gateway/files.ts`：预览路径解析允许**沙箱根内绝对路径**（E348）——AI 回复回执里的绝对产物路径 `M:\…\outputs\pm-xmind\…xmind` 可直接读回；根外仍 `bad_path`。
2. `ui/prototype/src/MindMapPreview.tsx`：改为**自适应缩小**——`ResizeObserver` 量滚动容器，SVG `viewBox` 等比缩到容器可视范围（整图一屏可见），再想放大用「在中间打开」。
3. 新增 `ui/prototype/src/XmindBubble.tsx`：消息内嵌卡片——按路径 fetch `/api/files/preview`，成功渲染 `MindMapPreview`（tree），失败显示错误小字。
4. `App.tsx`：新增 `extractXmindPaths()`（从消息文本提取去重 `.xmind` 路径，最多 3 个）；`MessageItem` 文本后渲染 `XmindBubble`，透传 `onOpenXmind`（放大→中间大窗口）；`openMapLargeByPath()` 按路径读回并打开大图。
5. `styles.css`：`.xmind-bubble*` 与 `.mindmap-svg` 居中样式；`.mindmap-scroll` 固定 320px 高避免自适应测量回环。
6. 验证：UI build + 后端 build/定向单测 + doc-lint。
7. 文档：计划（本文件）、需求附录 A E348、当日 handoff 登记。

**验收标准**

- 批准生成 `.xmind` 后的执行回执气泡内直接出现可视化思维导图（无需去右栏/弹层）；
- 卡片自适应缩小到消息宽度/高度内整图可见，可切「大纲」，可点「在中间打开」放大；
- 文本消息里手写/复制 `.xmind` 路径也会触发内嵌；预览端点绝对路径仅在沙箱根内放行。

## 执行过程

### 改动

- `files.ts`：`resolvePreviewPath` 支持绝对路径（win32 大小写不敏感比较，须命中 `projects/sandbox/outputs/data/datasheets` 根前缀且无 `..`）。
- `MindMapPreview.tsx`：ResizeObserver + viewBox 等比缩放（整图缩到可视）。
- `XmindBubble.tsx`：新增消息内嵌卡片（loading / err / ok 三态）。
- `App.tsx`：路径提取 + 卡片渲染 + 放大回调。
- `styles.css`：`.xmind-bubble*`、固定 320px 地图区等。

### 遇到的问题

- 自适应测量用 auto-height 容器会随内容缩小再次触发 ResizeObserver 形成“缩了又缩”回环：把地图滚动区改成固定 320px 高，测量基准稳定。
- 回复文本里的产物路径是 Windows 绝对路径，原预览端点拒绝绝对路径：补“沙箱根内绝对路径放行”（win32 不区分大小写前缀比较，根外照旧 400）。

## 结果

- 验证：`npm --prefix ui/prototype run build` 绿（tsc+vite）；`npm run build` 绿；files + gateway 定向 38/38（E345/E348 绝对路径用例）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；全量 test:all/bench 未跑（成本纪律）。
- 测试：files 4/4 + gateway 34/34。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——重启 gateway + 刷新 UI，批准生成/读回 `.xmind` 后，对应回复气泡内应直接显示思维导图（自适应整图），可切大纲、可放大；旧消息不回溯（只对刷新后新回复生效）。
