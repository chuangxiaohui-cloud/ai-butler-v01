# 推进计划：负反馈关联 Skill 复审

> 日期：2026-09-12 · 分支：v0.2b · 状态：完成（未提交）

## 目标

继续落实 §9.3：把回复 👎 关联到实际触发的 Skill，并按 [P-79] 检测同一 Skill 连续负反馈后标记“需复审”。

## 计划

1. 先补 pipeline Skill 标识、反馈审计与生命周期复审测试
2. 回答契约携带实际触发的 Skill，UI 随反馈回传
3. gateway 基于每条回复最新反馈同步 Skill 负反馈状态
4. 更新文档与交接记录

**验收标准**

- 仅实际触发 Skill 的回复携带 `skillName`
- 反馈审计保存 `skillName`，同一回复改票按最新值重算
- 同一 Skill 连续 👎 达 [P-79] 后进入 review
- 本轮同步不改变 Skill confidence，不自动降权

## 执行过程

### 改动

- `AnswerResult` 在预置 Skill 直达、市场 Skill 直达和搜索链 Skill 注入成功时返回实际 `skillName`；UI 随回复保存并在反馈时回传。
- `AnswerFeedbackEntry` 保存 `skillName`；`latest()` 在改票时把该回复移动到最新事件位置，便于按真实事件顺序判断连续 👎。
- gateway 每次反馈后，按该 Skill 的回复最新值重算 👎 总数与尾部连续 👎，同步给 Skill 生命周期。
- `SkillLifecycle.syncReviewSignals()` 达 [P-79] 后置 `needs_review`，不改变 confidence；gateway 启动时同时注册已安装市场 Skill。

### 遇到的问题

- gateway 测试首次使用严格浮点相等，生命周期按毫秒衰减产生约 2e-10 的显示差异；改为 1e-6 容差后通过，确认同步 SQL 未修改 confidence。
- `doc-lint` 仍仅被需求文档第 19 行既有 provisional 示例超期阻断，与本轮无关。

## 结果

- 主项目与 UI `npm run build`：通过。
- lifecycle + feedback-store：8/8 通过。
- pipeline Skill 标识：4/4 通过。
- gateway feedback：3/3 通过。
- `git diff --check`：通过。
- 未运行 E2E / bench，零外部 LLM 调用，未提交。
