# 推进计划：输入框上下文用量图 + 模式收缩（E108）

> 日期：2026-08-16 · 分支：v0.2b · 状态：已完成

## 目标

按 UI 反馈精简聊天输入框：右下角新增上下文用量环，Ask/Craft/Plan 从常驻三按钮
改为可收缩的下拉式控件，避免工具行摊开占空间。

## 计划

1. Composer 增加 `contextUsage` prop：按当前会话消息长度估算用量（6% 起，封顶 100%），
   右下角用 SVG 环形图 + 百分比展示。
2. mode-switch 改为单按钮 + 弹出层：默认只显示当前模式，点击展开 Ask/Craft/Plan。
3. 补样式（popover、环形图），跑 UI 构建，用 Playwright 验证布局与交互。
4. 登记需求文档附录 A（E108）与交接，提交推送。

**验收标准**

- 输入框右下角可见上下文用量环，且随消息增长变化。
- 模式区只显示一个收缩按钮，展开可选 3 个模式，选择后自动收起。
- 1280px 视口无横向溢出。

## 执行过程

### 改动

- `ui/prototype/src/App.tsx`：`contextUsage` 计算（文本长度 + 图片估算）；
  `modeOpen` 状态；模式单按钮 + `mode-popover`；右侧 `context-meter` SVG 环形图。
- `ui/prototype/src/styles.css`：`.mode-switch` 改弹层布局，新增
  `.mode-popover` / `.context-meter` 样式。

### 遇到的问题

- 参考图在本地无法预览，按需求文字实现：右下角用量图 + 模式收缩。
- npx playwright-cli 下载被系统权限拦截，改用项目内 `playwright-core` +
  既有 Chromium 路径做无头验证。

## 结果

- 验证：UI `npm run build` 通过；Playwright 检查无横向溢出（1280/1280）、
  模式按钮数 = 1、用量图位于工具行右下角；点击模式按钮弹出 3 项，选 Craft 后
  按钮文字变为 Craft 且弹层关闭。
- 提交：E108 已提交并推送 Gitee/GitHub。
