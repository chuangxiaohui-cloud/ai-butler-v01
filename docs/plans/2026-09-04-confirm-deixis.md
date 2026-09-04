# 推进计划：confirm 复述人称切换（E326）

> 日期：2026-09-04 · 分支：v0.2b · 状态：已完成
> 承接：owner 验收 E324/E325 时指出——用户「我让 AI 帮我…我家里…」，AI 确认文案却复述为「你让我“帮我…我家里…”」，人称错乱。

## 目标

AI 复述用户请求时统一用第二人称（你/你家里），确认文案示例：提问「帮我安排一下我家里明天的亲子游行程安排」→
「你让我“帮你安排一下你家里明天的亲子游行程安排”」；resume 恢复执行仍用原始 query，不受影响。

## 改动

- `src/escalation/confirm-gate.ts`：新增并导出纯函数 `restateForUser(query)`（第一人称「我」→ 第二人称「你」，
  含 我们→你们；仅用于展示复述）；`buildConfirmHoldAnswer()` 的复述段改用切换后文案。
- `src/escalation/confirm-gate.test.ts`：新增 1 条——restateForUser 断言 + 确认文案含
  「你让我“帮你安排一下你家里明天的亲子游行程安排”」且不含「“帮我/我家里」。

## 结果

- 验证：`npm run build` 绿；confirm-gate 3/3 + pipeline 67/67 + gateway 27/27 回归绿；`npm run doc-lint`
  0 FAIL 0 WARN；全程零外部 LLM/API（¥0）；全量 `test:all`/bench 未跑（成本纪律）。
- 文档：需求文档附录 A E326 登记；本计划；09-04 交接追加轮；code-directory escalation 行同步。
- 提交：未提交（延续工作区待统一确认批次）。
