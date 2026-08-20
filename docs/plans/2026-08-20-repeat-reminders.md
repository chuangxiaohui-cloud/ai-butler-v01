# 推进计划：重复提醒（每天/每周）（E165）

> 日期：2026-08-20 · 分支：v0.2b · 状态：已完成

## 目标

主动提醒支持循环周期：设置时识别“每天/每日、每周”，到期触发后自动顺延下一次，
避免补发刷屏；重复提醒仍可列出/取消。

## 计划

1. `reminder-store.ts`：表加 `repeat` 列（''/daily/weekly，含 ALTER 迁移）；`add` 接受 repeat；
   `dueReminders` 对重复提醒触发后顺延到下一个未来时刻（防补发刷屏），普通提醒仍标记 fired。
2. `office-daily` 提醒创建：解析“每天/每日 → daily、每周/每星期 → weekly”，“工作日”诚实提示暂不支持；
   结果文案带周期；列出/取消逻辑兼容重复提醒。
3. 测试：store 重复顺延 + office-daily 设置每天/每周 + 取消重复提醒。
4. 登记附录 A（E165）、更新 plan/handoff/skills README；跑 build/test/doc-lint。

**验收标准**

- 单测新增 ≥2 条全绿，集成 17/17 不变；doc-lint 0 FAIL 0 WARN；
- “每天早上9点提醒我喝水”落库 repeat=daily，到期触发一次并顺延 +24h。

## 执行过程

### 改动

- `src/reminder/reminder-store.ts`：表加 `repeat` 列（含 ALTER 迁移），`add` 支持 repeat，
  首次时间已过自动顺延到下一未来时刻；`dueReminders` 对重复提醒触发后顺延下一次
  （离线多日只补发一次防刷屏）。
- `src/agent/time-expression.ts`：`parseTimeExpression` 支持“周X/下周X/星期X”，
  周X 取本周最近匹配日（含今天，已过则下周同日），下周X 固定到下一周。
- `src/skills/office-daily/index.ts`：提醒创建识别“每天/每日/天天→daily、每周/每星期→weekly”，
  结果文案带周期；“工作日/每周末/每月/周X到周X”等复杂周期只在提醒时间同段时诚实提示暂不支持；
  消息清理兼容“每周一”等周期前缀与时间表达重叠；列出/取消兼容重复提醒。
- 测试：`time-expression.test.ts` +3（周X/下周X/星期X）、`reminder-store.test.ts` +3
  （创建顺延/到期顺延/离线补发）、`office-daily/index.test.ts` +3（每天/每周/复杂周期提示）。

### 遇到的问题

- “每周一9点”的时间表达提取为“周一9点”，消息清理会残留“每”前缀：补 `.replace(/^每/,'')` 收尾。
- 复杂周期“工作日/每月”可能命中消息内容（如“每月报告”）：改为仅在周期词位于提醒时间之前时拒绝。

## 结果

- 验证：`npm run build` 通过；定向 `node --test dist/agent/time-expression.test.js dist/reminder/reminder-store.test.js dist/skills/office-daily/index.test.js` 41 通过 + 1 条 fitz 门控用例按环境跳过；`npm run test` 482/482 + 1 跳过；`npm run test:integration` 17/17；`doc-lint` 0 FAIL 0 WARN。
- 测试：单测 482/482 + 1 门控跳过 + 集成 17/17
- 提交：待提交（用户手动 git add + commit）
- 遗留事项：重复日程/取消提醒可复用同一 repeat 机制；UI 事件流透出重复提醒周期标识。
