# 推进计划：UI 渲染平台消歧选项（E434）

> 日期：2026-09-17 · 分支：v0.2b · 状态：完成（未提交）

## 目标

把 E433 的结构化 `platformChoices` 在对话产物卡（`mcp-domain-workflow*`）上渲染为可点按钮；点击后向 pipeline 发送明确平台的构建问句。纯文案 `followUpAction` 仍保留。

## 结果

- `buildPlatformChoiceFollowUpQuery` 已落地并有单测；问句可被 `isMcpDomainBuildRequest` 识别。
- UI 产物卡在 ≥2 个 choices 时展示按钮；点击发跟进问句；选后禁用防连点。
- §4.1.2 + 附录 A E434 已登记。
