# 推进计划：提醒管理（列出/取消）（E163）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

office-daily 主动提醒从“只能设置”扩展为“设置/列出/取消”闭环：
- “查一下提醒/有哪些提醒”列出待触发提醒（编号+时间+内容）；
- “取消第 N 条提醒”或“取消 XXX 提醒”按编号/关键词取消；
- ReminderStore 补 cancel 方法。

## 计划

1. `reminder-store.ts`：新增 `cancel(id)`（按 id 删除，返回是否命中）。
2. `office-daily` reminder 模式：先判“列出”再判“取消”再走“创建”；列出过滤已触发，
   取消支持编号或关键词，无目标时诚实提示。
3. 测试：ReminderStore.cancel 往返、列出提醒、按编号/关键词取消。
4. 登记附录 A（E163）、更新 plan 结果/handoff/skills README；跑 build/test/doc-lint。

**验收标准**

- 单测新增 ≥3 条全绿，集成 17/17 不变；doc-lint 0 FAIL 0 WARN；
- “取消开会提醒”只取消内容含“开会”的提醒，其余保留。

## 执行过程

### 改动

- src/reminder/reminder-store.ts：新增 cancel(id)（按 id 删除，返回是否命中）。
- src/skills/office-daily/index.ts：reminder 模式先判“列出”再判“取消”再走“创建”；列出过滤已触发提醒，
  取消支持编号或关键词。
- src/reminder/reminder-store.test.ts：新增 cancel 往返；src/skills/office-daily/index.test.ts：新增列出/关键词取消/编号取消 3 条。

### 遇到的问题

- 模板字符串批量替换曾破坏表达式，改用整块重写恢复。

## 结果

- 验证：npm run build 通过；doc-lint 0 FAIL 0 WARN；“取消开会提醒”只取消含“开会”的提醒。
- 测试：单测 471/471 通过 + 1 条 fitz 门控跳过 + 集成 17/17。
- 提交：待用户提交（沙箱禁止写 .git）。
- 遗留事项：重复提醒（每天/每周）、已触发提醒清理待排期。
