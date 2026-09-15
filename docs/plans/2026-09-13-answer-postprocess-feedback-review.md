# answer_postprocess 反馈复审闭环

状态：已完成（未提交）

## 计划

1. 将 `postprocessSkillNames` 写入回复反馈审计。→ 验证：改票后仍保留 append-only 历史，latest 只取最后一次。
2. 按用户和规则重算最新负反馈，连续达到 [P-79] 时标记需复审。→ 验证：规则保持 enabled，不自动停用。
3. 在 Skill 设置页展示规则生命周期统计。→ 验证：UI 类型构建通过。
4. 补交接与需求附录 A 记录。→ 验证：build、定向单测与 doc-lint。

## 结果

- `AnswerFeedbackEntry` 新增可选 `postprocessSkillNames`，UI 从问答结果保存并随反馈回传。
- `AnswerPostprocessRuleStore` 以 append-only 事件记录使用次数与反馈信号；旧记录自动补零兼容。
- gateway 按用户和规则从最新回复反馈重算累计/连续 👎，达到 [P-79] 只置 `needsReview`，不改变 enabled 状态。
- Skill 候选卡展示使用次数、累计/连续 👎 与复审状态。
- 验证：主项目 build 通过；UI build 通过；反馈库 + 后处理规则测试 4/4；gateway 本轮闭环 1/1。
- `git diff --check` 无空白错误；`doc-lint` C1-C6/C8 通过，仅既有第 19 行 provisional 示例超期导致 C7 2 FAIL / 0 WARN。
- 未运行 E2E、全量 bench 或外部 LLM，未提交。
