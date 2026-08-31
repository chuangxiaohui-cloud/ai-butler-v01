# 推进计划：修复「读第 N 封」序号错位（E293 缺陷）

> 日期：2026-08-31 · 分支：v0.2b · 状态：已完成

## 目标

修复 E293 收件冒烟发现的缺陷：「读第 N 封」的 N 应指收件箱列表位次（1=最新一封），而非 IMAP 原始 seq。

## 计划

1. `src/skills/office-daily/index.ts`：读第 N 封改为先取最近列表、按位次定位真实 seq 再读正文；列表行首改为位次编号（1..N）
2. `src/skills/office-daily/index.test.ts`：更新列表断言为位次编号；「读第 1 封」断言改最新一封正文；新增「读第 2 封」「读第 99 封」用例
3. 验证：`npm run build` + office-daily 相关单测全绿

**验收标准**

- 「读第 1 封」= 列表第一条（最新一封），与 followUpAction 文案一致
- 「读第 2 封」= 次新一封（fake 中 IMAP seq=1 的 alice），证明按位次而非原始 seq
- 超出显示范围（读第 99 封）→ 诚实提示
- `npm run build` 绿；office-daily 全文件单测全绿

## 执行过程

### 改动

1. `src/skills/office-daily/index.ts`：收件分支「读第 N 封」先 `fetchRecentEmails(limit:10)` 取最近列表，按 `recent[N-1]` 定位真实 seq 再 `fetchEmailText`；列表行首由 `m.seq` 改为 `i+1` 位次编号；`extractReadSeq` 注释改为「位次」。
2. `src/skills/office-daily/index.test.ts`：列表断言改位次编号；「读第 1 封」正文断言改最新一封（bob）；新增「读第 2 封 → 次新一封（alice）」「读第 99 封 → 诚实提示」用例。

### 遇到的问题

无（fake IMAP 仅 2 封时 seq 恰好等于位次，是缺陷未被单测暴露的根因；已新增位次≠seq 的用例覆盖）

## 结果

- 验证：`npm run build` 绿；office-daily 单测 66/67（1 skip，含新增「读第 2 封」「读第 99 封」用例）；imap+router-v2 88/88；`npm run test:integration` 32/32 全绿。
- 测试：更新 3 处断言（列表位次编号、「读第 1 封」正文为最新一封）+ 新增 2 条用例
- 提交：本次未提交（待 owner 决定是否随 v0.2b 收尾一并提交）
- 遗留事项：列表仍只显示最近 10 封，N 有效范围 1..10；主题 MIME 解码 / HTML 清洗仍为 v2.6 候选
