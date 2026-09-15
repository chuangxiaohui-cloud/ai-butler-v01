# 推进计划：思维导图「中间大窗口」查看（E347）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

E346 复验后 owner 反馈：右侧栏窗口小，导图不能缩小、只能上下滚动看不到全貌，「想在中间面板看到思维导图」。方案：右栏预览卡加「在中间打开 ↗」按钮，点击后屏幕中央出现大窗口弹层显示整张导图——默认「适应窗口」把全图缩到可视范围，另可 100% / 放大 / 缩小，并可切回大纲文本；Esc / ✕ 关闭。

## 计划

1. `ui/prototype/src/MindMapPreview.tsx`：导出 `NODE_H` / `MAX_MAP_NODES` / `countNodes` / `layoutTree` / `LaidNode` / `MindMapLayout`（供大图复用）；组件加可选 `onOpenLarge`，有值时工具栏显示「在中间打开 ↗」。
2. 新增 `ui/prototype/src/MindMapLarge.tsx`：fixed 全屏弹层（z-index 100）——顶栏（路径 / 节点数 / 当前缩放% / 导图·大纲切换 / 适应·100%·±缩放 / ✕），主体按 `ResizeObserver` 量容器尺寸；SVG 用 `viewBox` 等比缩放（宽高 = 布局 px × 缩放比，矢量缩放文字不糊）；全部能放下时居中，放大超出时可滚动；`Esc` 关闭；>320 节点自动退大纲。
3. `App.tsx`：`mapLarge` state；`openMapLarge()` 取当前 `.xmind` 树；`MindMapPreview` 传 `onOpenLarge`；根节点渲染 `MindMapLarge` 弹层。
4. `styles.css`：补 `.map-large* / .mindmap-open-large` 样式。
5. 验证：UI `tsc+vite` build；后端不受影响但回归 build + 定向单测；doc-lint。
6. 文档：计划（本文件）、需求附录 A E347、当日 handoff 登记。

**验收标准**

- 右栏预览卡点「在中间打开 ↗」→ 屏幕中央出现大窗口，整张导图默认缩放到一屏可见（不用滚动即可看全貌）；
- 可放大/缩小/100%/适应窗口；放大后可在窗口内拖动滚动条看细节；Esc 或 ✕ 关闭回到原界面。

## 执行过程

### 改动

- `MindMapPreview.tsx`：导出布局与常量，加 `onOpenLarge` 按钮。
- `MindMapLarge.tsx`：新增大窗口组件（fit 缩放算法见文件头注释）。
- `App.tsx`：state + 打开处理 + 弹层挂载。
- `styles.css`：`.map-large*` 全屏弹层样式。

### 遇到的问题

- SVG 缩到全图可视需矢量等比缩放：不能用 CSS `transform: scale`（不影响滚动尺寸），改用 `viewBox` + 显式 `width/height = 布局px × 缩放比`，字体/连线随矢量缩放不糊。
- 放大超出容器时若居中会裁掉左/上溢出不可滚动：容器内按“能放下才居中、放不下左对齐”切换 flex 对齐。

## 结果

- 验证：`npm --prefix ui/prototype run build` 绿（tsc+vite）；后端 `npm run build` 绿 + files/gateway 定向 38/38（E345/E346 用例未动）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；全量 test:all/bench 未跑（成本纪律）。
- 测试：无新增后端逻辑，UI 走 tsc 类型检查 + vite 构建。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——重启 gateway + 刷新 UI 后，双击 `.xmind` → 点「在中间打开 ↗」→ 大窗口应默认整图一屏可见（适应窗口）；点 +/- 放大后可滚动看细节；Esc/✕ 关闭。
