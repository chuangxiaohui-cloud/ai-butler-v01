# answer_postprocess 复审完成入口

状态：已完成（未提交）

## 计划

1. 先补规则账本测试，锁定复审恢复只清状态、不丢统计和启用状态。
2. 复用既有规则接口增加用户级 `restore_review` 动作。
3. Skill 候选卡仅在需复审时显示带确认的“复审完成”入口。
4. 运行主项目/UI build、定向测试与文档检查，并登记 E385。

## 结果

- `AnswerPostprocessRuleStore.clearReview()` 以 append-only 事件清除复审标记和连续 👎，保留累计 👎、使用次数、启用状态与历史。
- gateway 规则接口新增用户级 `restore_review` 动作；不存在或跨用户规则拒绝处理。
- Skill 候选卡仅在 `needsReview` 时显示“复审完成”，操作前由用户确认。
- 验证：主项目与 UI build 通过；后处理规则测试 3/3，gateway 本轮闭环 1/1。
- `git diff --check` 无空白错误；`doc-lint` C1-C6/C8 通过，仅既有第 19 行 provisional 示例超期导致 C7 2 FAIL / 0 WARN。
- 未运行 E2E、全量 bench 或外部 LLM；未提交。
