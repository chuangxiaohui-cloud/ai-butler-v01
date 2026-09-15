# 推进计划：思维导图查看器升级为可交互（滚动/缩放/全屏）E349

> 日期：2026-09-05 · 分支：v0.2b · 状态：完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

owner 反馈：E347/E348 把导图搬到中间后「还是一张图」，回复栏里不能放大、不能全屏/缩放；要求消息回复里**直接是可交互思维导图**——可上下/左右滚动、可缩放（适应/100%/−/+/Ctrl+滚轮）、可原生全屏，并且聊天内嵌卡片与右栏 .xmind 预览共用同一实现。

## 计划

1. 抽公共布局纯函数模块 ui/prototype/src/mindMapLayout.ts：layoutTree()（横向树：叶子逐行分配 y、父节点取子均值、三次贝塞尔连线、一级分支 8 色循环、超宽标题截断留 tooltip）+ countNodes() + 布局常量（行高/列距/320 节点上限）——查看器与预览多处复用。
2. 新增可交互查看器 ui/prototype/src/MindMapViewer.tsx：导图/大纲切换；ResizeObserver 量视口；缩放状态（null=适应窗口，按钮 适应/100%/−/+/Ctrl(⌘)+滚轮，0.08–5 钳制）；视口 overflow:auto 双轴滚动；原生全屏（进入/退出状态跟随，全屏时视口 flex 撑满可继续缩放滚动）。
3. XmindBubble.tsx（聊天回复内嵌）与 App.tsx 右栏 .xmind 预览统一渲染 MindMapViewer；移除 E347 弹层入口（MindMapLarge/「在中间打开」）与 E346 旧预览组件，聊天内嵌不再只给静态图。
4. styles.css：.mmv-* 一套样式（root/toolbar/zoom-label/count/viewport/svg/outline/fullscreen）；删除已无引用的 .mindmap-* / .map-large-* / .mindmap-open-large 旧块（同批次 E346/E347 遗留）。
5. 文档：计划（本文件）、需求附录 A E349、当日 handoff 登记。

**验收标准**

- 批准生成/读回 .xmind 后，新回复气泡内直接是可交互导图：默认整图一屏可见；点 +/−/100%/适应 缩放，放大后视口可上下左右滚动；「全屏」进入浏览器全屏、视口撑满后可继续缩放滚动。
- 右栏双击 .xmind 的预览与聊天内嵌共用同一查看器与同一套行为。
- 旧消息不回溯（只对刷新后新回复生效）。

## 执行过程

### 改动

- mindMapLayout.ts：从查看器抽出的纯布局/计数模块（见计划 1）。
- MindMapViewer.tsx：交互查看器（见计划 2）。
- XmindBubble.tsx / App.tsx：统一改用 MindMapViewer；右栏预览与消息内嵌共用。
- styles.css：新增 .mmv-*，删除 .mindmap-*/.map-large-* 旧块（替换后类名核对 0 引用残留）。

### 遇到的问题

- 先前 E348 回复卡片为静态自适应图、无缩放/全屏入口；E347 弹层只居中放大不能全屏——统一收敛到同一可交互组件后行为一致。
- 全屏后视口若仍固定 340px 会留大片空白：CSS :fullscreen 下 .mmv-viewport 改 flex:1 1 auto; height:auto，随容器重测自动重新「适应」。

## 结果

- 验证：npm --prefix ui/prototype run build 绿（tsc+vite）；npm run doc-lint 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；后端无改动（纯前端收敛），全量 test:all/bench 未跑（成本纪律）。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——重启 gateway + 刷新 5173 后走「把这段大纲做成思维导图 → 批准」或右栏双击 .xmind：回复气泡/预览卡内导图可缩放、放大后可上下左右滚动、可原生全屏。
