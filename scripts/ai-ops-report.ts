#!/usr/bin/env node
/**
 * E318：AI 运营日报写入通知库 CLI（npm run ai-ops:report）
 * 手动兜底入口：与 gateway 22:00 定时共用 emitAiOpsDailyReport（按日幂等，重复触发返回 dup）。
 * 输出写入结果与预算档位；失败 exit 1。全程零外部 LLM/API。
 */

import { emitAiOpsBudgetAlerts, emitAiOpsDailyReport } from '../src/usage/ai-ops-notify.js';

try {
  const daily = emitAiOpsDailyReport();
  const budget = emitAiOpsBudgetAlerts();
  console.log(
    JSON.stringify(
      {
        dailyReport: { status: daily.status },
        budgetAlerts: {
          emitted: budget.emitted,
          band: budget.band,
          todayCny: budget.todayCny,
          dailyBudgetCny: budget.dailyBudgetCny,
          alerts: budget.alerts,
        },
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
