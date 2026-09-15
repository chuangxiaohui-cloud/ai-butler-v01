# 每日回复反馈汇总

状态：已完成（未提交）

## 计划

1. 先补 `FeedbackStore` 测试，锁定当日、本用户、每条回复最新票的汇总口径。
2. 在通知读取 API 返回当前用户的今日反馈计数、主要 👎 原因与可读摘要。
3. 右栏通知页展示“今日反馈”，只读呈现，不自动调权或生成通知事件。
4. 运行主项目/UI build、定向测试、`git diff --check` 与 `doc-lint`，并登记 E387。

**验收标准**

- 只统计本地自然日内当前用户的最新反馈；跨用户、跨日和已改票旧事件不重复计入。
- 摘要包含 👍、👎、修改建议计数；有 👎 原因时显示主要原因。
- 无反馈时显示明确空态；读取摘要不写任何状态。
- 不运行 E2E、全量 bench 或外部 LLM，不提交。

## 结果

- `FeedbackStore.dailySummary()` 按本地自然日、userId 与每条回复最新票统计 👍/👎/修改建议，并给出主要 👎 原因和可读摘要。
- `GET /api/notifications` 新增当前用户 `feedbackSummary`；右栏通知页展示“今日反馈”，无反馈时显示明确空态。
- 验证：主项目与 UI build 通过；feedback-store 2/2，gateway 本轮闭环 1/1。
- `git diff --check` 无空白错误；`doc-lint` C1-C6/C8 通过，仅既有第 19 行 provisional 示例超期导致 C7 2 FAIL / 0 WARN。
- 未运行 E2E、全量 bench 或外部 LLM；未提交。
