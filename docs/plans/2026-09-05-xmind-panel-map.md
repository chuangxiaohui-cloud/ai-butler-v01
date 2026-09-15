# 推进计划：.xmind 面板可视化思维导图预览（E346）

> 日期：2026-09-05 · 分支：v0.2b · 状态：已完成（未提交，待 owner 拍板批次 + 手动复验）

## 目标

E345 复验通过（owner 实测：右侧栏双击 `.xmind` 已能看到大纲文本）。owner 追问「如何在面板显示思维导图」——把只读预览从文本大纲升级为可视化树状导图：`.xmind` 预览时网关把解析出的 MindNode 树一并返回，UI 用零依赖 SVG 横向树布局（根在左、分支向右）绘制导图，可一键切回大纲文本。

## 计划

1. `src/gateway/files.ts`：`FilePreviewResult` 成功分支加可选 `tree?: MindNode`（E346），`readXmindFilePreview` 返回 `tree: root`——复用 pm-xmind `parseXmindBuffer` 结果，无二次解析。
2. UI：新增 `ui/prototype/src/MindMapPreview.tsx`（纯 React + SVG：叶子逐行 y、父节点取均值、曲线连线；一级分支 8 色循环；超 320 节点自动退回大纲并提示）；`App.tsx` 预览卡带 `tree` 时渲染组件，工具栏「导图 / 大纲」切换；`styles.css` 补 `.mindmap-*` 最小样式。
3. 测试：`files.test.ts` E345 用例改断言——仍验文本大纲，另用 `mindShape`（忽略每次不同的 id）断言返回树标题结构。
4. 验证：build + files/gateway 定向单测 + UI build + doc-lint；全程零外部 LLM/API。
5. 文档：计划（本文件）、需求附录 A E346、当日 handoff 登记。

**验收标准**

- 双击右栏 `.xmind`，预览卡默认显示可视化导图（中心主题 + 彩色一级分支 + 连线），工具栏可切「大纲」看回文本；
- 超大导图（>320 节点）自动退大纲并提示，不卡界面；
- 文本类预览与 E345 行为不变。

## 执行过程

### 改动

- `src/gateway/files.ts`：成功结果增 `tree?: MindNode`，xmind 预览带树。
- `ui/prototype/src/MindMapPreview.tsx`：新增组件（布局/配色/截断/超量兜底见文件头注释）。
- `ui/prototype/src/App.tsx`：`filePreview` 类型与请求解析增 `tree`；有 `tree` 时渲染 `MindMapPreview`（默认导图），否则仍走原 `<pre>`。
- `ui/prototype/src/styles.css`：`.mindmap-toolbar / .mindmap-scroll / .mindmap-outline` 等最小样式。
- 测试：`src/gateway/files.test.ts` 加 `mindShape` 帮助函数并断言返回树结构（leaf 不带空 children）。

### 遇到的问题

- 单测首版用 `deepStrictEqual` 对整棵返回树，但 `parseXmindBuffer` 反解会重发新 id 且叶子带空 `children: []` → 断言失败；改为 `mindShape` 只比较标题结构（忽略 id 与空 children）。
- SVG 长标题无法自动省略号：布局前按字符宽度估算截断加「…」，完整标题放 `<title>` tooltip。

## 结果

- 验证：`npm run build` 绿；`node --test dist/gateway/files.test.js dist/gateway/app.test.js` 38/38 全绿；`npm --prefix ui/prototype run build` 绿（tsc+vite）；`npm run doc-lint` 0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；全量 test:all/bench 未跑（成本纪律）。
- 测试：files 4/4 + gateway 34/34。
- 提交：未提交，待 owner 拍板批次。
- 遗留事项：owner 手动复验——重启 gateway 后双击 `.xmind` 应看到可视化导图（根在左、彩色分支向右、可横向滚动），点「大纲」切回文本；放大导图跨层/子主题样式如需再立小轮。
