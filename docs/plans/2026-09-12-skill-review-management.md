# 推进计划：Skill 复审状态与恢复入口

> 日期：2026-09-12 · 分支：v0.2b · 状态：完成（未提交）

## 目标

继续落实 §9.3：在 Skill 设置页展示复审状态与 👎 计数，并由用户确认后恢复使用。

## 计划

1. 先补生命周期恢复与 gateway 管理 API 测试
2. Skill 列表 API 合并 lifecycle 状态，新增恢复操作
3. UI 展示状态并加入确认恢复按钮
4. 运行构建、定向测试并更新文档

**验收标准**

- Skill 设置页可见 active/cold/review、累计 👎、连续 👎
- 只有 review 状态显示“恢复使用”操作
- 用户确认后清除 needs_review 与连续 👎
- 累计 👎 与 confidence 保留，不自动调权

## 执行过程

### 改动

- `SkillLifecycle.clearReview()` 清除 `needs_review` 与连续 👎，保留累计 👎 和 confidence。
- `GET /api/skills` 合并 lifecycle 状态、累计 👎、连续 👎 与 confidence；新增受鉴权保护的 `POST /api/skills/review` 恢复入口。
- Skill 设置页显示“正常/冷存/需复审”和反馈计数；只有需复审项显示“恢复使用”，操作前使用原生确认框。

### 遇到的问题

- 无产品实现问题；首次验证命令工作目录参数写错，未执行也未修改文件，纠正后验证通过。
- `doc-lint` 仍仅被需求文档第 19 行既有 provisional 示例超期阻断，与本轮无关。

## 结果

- 主项目与 UI `npm run build`：通过。
- skill-lifecycle：7/7 通过。
- gateway Skill 管理 API：2/2 通过。
- `git diff --check`：通过。
- 未运行 E2E / bench，零外部 LLM 调用，未提交。
