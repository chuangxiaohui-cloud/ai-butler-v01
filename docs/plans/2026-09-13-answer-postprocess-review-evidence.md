# answer_postprocess 复审负反馈证据

状态：已完成（未提交）

## 计划

1. 先补 gateway 定向测试，锁定待复审规则只返回当前用户最近一条仍为 👎 的反馈证据。
2. 复用 `FeedbackStore.latest()`，在 Skill 候选读取结果中附带原因、补充说明、原问题、原回答与反馈时间。
3. Skill 候选卡在“复审完成”入口前展示证据，让用户先查看再确认。
4. 运行主项目/UI build、定向测试、`git diff --check` 与 `doc-lint`，并登记 E386。

**验收标准**

- 已改票为 👍/修改建议的旧 👎 不作为复审证据，最近证据按反馈时间选择。
- 证据读取按 `userId` 隔离；非待复审规则不返回复审证据。
- 查看证据不改变规则状态；复审完成仍只清复审状态与连续 👎。
- 不运行 E2E、全量 bench 或外部 LLM，不提交。

## 结果

- Skill 候选读取仅在规则 `needsReview` 时返回当前用户最近一条仍为 👎 的反馈证据，包含原因、补充说明、原问题、原回答与反馈时间。
- 证据基于 `FeedbackStore.latest()`：已改票为 👍/修改建议的旧 👎 自动退出证据集合；同名规则的其他用户反馈不会串入。
- Skill 候选卡在“复审完成”按钮前直接展示证据；查看不写状态，确认后的恢复语义保持 E385 不变。
- 验证：`npm run build`、`npm --prefix ui/prototype run build` 通过；gateway 本轮闭环 1/1。
- `git diff --check` 无空白错误；`doc-lint` C1-C6/C8 通过，仅既有第 19 行 provisional 示例超期导致 C7 2 FAIL / 0 WARN。
- 未运行 E2E、全量 bench 或外部 LLM；未提交。
