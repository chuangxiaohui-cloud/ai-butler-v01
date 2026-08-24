# 推进计划：重复日程（每天/每周）（E166）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

日历支持重复日程：创建时识别“每天/每日、每周/每星期”，自动登记同周期的重复提醒
（复用 E165 的 `ReminderStore.repeat` 机制），查询展示周期；复杂周期诚实提示暂不支持。

## 计划

1. `time-expression.ts` 抽共用解析助手：`detectRepeat`（每天/每日/天天→daily、每周/每星期→weekly）、
   `extractTimeExpressionOrBare`（重复周期 + 纯时间如“每天早上9点”本地兜底组装）、
   `parseRepeatQuery`（整合 repeat + timeExpression + 复杂周期判定，与 office-daily E165 逻辑一致）。
2. `calendar-skill`：`calendar_events` 表加 `repeat` 列（含 ALTER 迁移）；创建分支识别周期，
   复杂周期（工作日/每周末/每月/周X到周X）诚实提示；提醒登记透传 repeat；查询展示周期。
3. `office-daily` 提醒创建改用共用助手（行为不变，回归由既有单测覆盖）。
4. 测试：time-expression +3、calendar-skill +3（每天/每周/复杂周期）；office-daily 回归。
5. 登记附录 A（E166）、更新 plan/handoff/skills README；跑 build/test/doc-lint。

**验收标准**

- 单测新增 ≥5 条全绿，集成 17/17 不变；doc-lint 0 FAIL 0 WARN；
- “帮我安排每天早上9点的站会”落库 repeat=daily 且提醒 repeat=daily；
- “每周一9点周会（提前10分钟）”提醒落在周一 8:50 且 repeat=weekly。

## 执行过程

### 改动

- `src/agent/time-expression.ts`：新增 `RepeatKind`、`detectRepeat`、`extractTimeExpressionOrBare`、
  `parseRepeatQuery`（复用 `extractTimeExpression` 与 E165 的复杂周期判定逻辑）。
- `src/skills/calendar-skill/index.ts`：`calendar_events` 加 `repeat` 列（含 ALTER 迁移）；
  创建分支用 `parseRepeatQuery` 识别周期，复杂周期诚实提示；提醒登记透传 repeat；
  查询展示“每天/每周重复”。
- `src/skills/office-daily/index.ts`：提醒创建改用 `parseRepeatQuery`，删除本地重复逻辑（行为不变）。
- 测试：`time-expression.test.ts` +3、`calendar-skill/index.test.ts` +3。

### 遇到的问题

- 周期+纯时间（“每天早上9点”）在 calendar 与 office-daily 各有一份兜底逻辑：抽成
  `extractTimeExpressionOrBare` 共用，避免第三份拷贝。
- 每周日程的提醒带提前量时，若测试在周一 8:50 后运行会被 `add` 顺延一周：
  断言改为允许 base 或 base+7d 两种值。

## 结果

- 验证：`npm run build` 通过；定向 `node --test dist/agent/time-expression.test.js dist/skills/calendar-skill/index.test.js dist/skills/office-daily/index.test.js` 45 通过 + 1 条 fitz 门控用例按环境跳过；`npm run test` 488/488 + 1 跳过；`npm run test:integration` 17/17；`doc-lint` 0 FAIL 0 WARN。
- 测试：单测 488/488 + 1 门控跳过 + 集成 17/17
- 提交：73a931c（E166 重复日程）
- 遗留事项：取消日程/取消日程提醒可复用 E163 cancel；真实日历/邮件服务接入评估。
