# 推进计划：预算闭环（budget_tracker 底座 + expense-tracker 记账/查预算，E308）

> 日期：2026-09-01 · 分支：v0.2b · 状态：已完成

## 目标

按五角色审阅结论（👑老板缺口2「预算实时扣减」+ 💁秘书 P0「记账 expense-tracker」）落地预算闭环：一个本地账本底座 `data/budget.db`（拨款/支出 append-only 事件），老板「查预算」与秘书记账共用同一份账本，余额 = 拨款合计 - 支出合计（§2.1 老板资源分配 / §5 预算唯一权威）。沉淀为市场 Skill `expense-tracker`，用户累积 Skill 34→35，登记附录 A E308。

## 计划

1. `src/budget/budget-store.ts`：SQLite append-only `budget_events` 表（scope/kind/amount/note/created_at），`add` / `summary(scope?)` / `recent`；dbPath 可注入 → verify: 单测（拨款/支出/余额/多 scope/负数余额诚实）
2. `src/skills/market/expense.ts`：`parseBudgetQuery`（查预算→query / 含金额+记账词→record / 含金额+预算词→allocate）+ `runBudgetCommand`（dbPath 可注入）→ verify: 单测（示例 query 全链）
3. 薄 CLI `scripts/market-expense-tracker.ts`（E251 @input）+ package.json `market:expense:tracker` → verify: `npm run build` 绿
4. manifest `configs/market-skills/expense-tracker`（command + input:query + 触发词「记账/查预算/预算查询/剩余预算/拨款」等，不含裸「预算」防抢知识问答）本地安装（--yes）→ verify: `skill:market:run -- --list` 含 35 包
5. 真实冒烟：记账 → 拨款 → 查预算，余额正确 → verify: `maturity:check` 用户累积 35/50+
6. 登记附录 A E308 + 今日交接文档 → verify: doc-lint 0 FAIL 0 WARN

**验收标准**

- 老板「查预算」返回各 scope 拨款/支出/余额；余额 = 拨款 - 支出
- 秘书「记一笔 80 元打样费」后，老板「查打样费预算」剩余正确
- 真实执行全链 ok:true；`maturity:check` 用户累积 Skill 34→35
- doc-lint 0 FAIL 0 WARN

## 执行过程

### 改动

- `src/budget/budget-store.ts`：BudgetStore（node:sqlite，对齐 ReminderStore 模式）；`data/budget.db`，env `BUDGET_DB_PATH` 可覆盖。
- `src/skills/market/expense.ts`：parseBudgetQuery / runBudgetCommand。
- `scripts/market-expense-tracker.ts` + package.json `market:expense:tracker`。
- `configs/market-skills/expense-tracker/manifest.json`：command + input:query + 中文触发词。
- `src/budget/budget-store.test.ts` + `src/skills/market/expense.test.ts`。

### 遇到的问题

- **quotation/bom-compare 回写**：本轮不做隐式猜测回写（会双记/误记）。记账入口为**显式**「记一笔…」；报价/采购单要入账时由用户显式指令（如「记入打样费预算」），避免老板看到与事实不符的扣减。诚实登记，后续如需自动回写再按指令级确认设计。
- **触发词防误触**：裸「预算」不登记为触发词（「项目预算怎么算」是知识问答）；只登记「查预算/预算查询/剩余预算/记账/记一笔/拨款/花销/支出」等明确记账/查询意图。

## 结果

- 验证：真实冒烟全链 ok:true——「给打样费设 100 元预算」→ allocate；「记一笔 80 元打样费」→ spend；「查打样费预算」→ 预算 100 / 已花 80 / 剩余 20。
- 测试：`npm run build` 绿；budget-store + expense 定向单测全绿。
- 提交：未提交（owner 未要求）。
- 遗留事项：quotation/bom-compare 显式入账钩子；L2 仍需 Skill 50+（差 15）/ 验收样本 n≥30 / 复用率 60%。
