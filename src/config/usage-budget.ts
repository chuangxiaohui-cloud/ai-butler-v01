/**
 * Token 预算持久化（E113）
 * UI“Token 用量”写入 data/usage-budget.json；降级阈值引用 P-108。
 * AI 运营预算（§COST）：日/月预算默认启用（P-143/P-144，owner 2026-09-02 拍板「开」），
 * hardStop 默认关（只告警不硬停）；老板可经 data/usage-budget.json 覆写或显式关闭。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { PARAMS } from './params.js';

export interface UsageBudget {
  budgetYuan: number | null;
  degradeAtPercent: number;
  /** AI 运营日预算（¥，§COST §14.3）；默认 [P-143]，null = 关闭阈值告警/硬停 */
  dailyBudgetCny: number | null;
  /** AI 运营月预算（¥，§COST §14.3）；默认 [P-144]，null = 报告不显示预算行 */
  monthlyBudgetCny: number | null;
  /** 日消耗 ≥ 日预算（[P-147] 用尽）时硬停（需 dailyBudgetCny 非空才生效，§COST C-4/C-5） */
  hardStop: boolean;
}

const DEFAULT_BUDGET: UsageBudget = {
  budgetYuan: null,
  degradeAtPercent: 90,
  dailyBudgetCny: PARAMS.aiOpsDailyBudgetDefaultCny,
  monthlyBudgetCny: PARAMS.aiOpsMonthlyBudgetDefaultCny,
  hardStop: false,
};

export function usageBudgetPath(root = process.cwd()): string {
  return join(root, 'data', 'usage-budget.json');
}

export function readUsageBudget(file = usageBudgetPath()): UsageBudget {
  if (!existsSync(file)) return { ...DEFAULT_BUDGET };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<UsageBudget>;
    return {
      budgetYuan: typeof raw.budgetYuan === 'number' ? raw.budgetYuan : null,
      degradeAtPercent:
        typeof raw.degradeAtPercent === 'number' ? raw.degradeAtPercent : DEFAULT_BUDGET.degradeAtPercent,
      dailyBudgetCny: typeof raw.dailyBudgetCny === 'number' ? raw.dailyBudgetCny : null,
      monthlyBudgetCny: typeof raw.monthlyBudgetCny === 'number' ? raw.monthlyBudgetCny : null,
      hardStop: raw.hardStop === true,
    };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

export function writeUsageBudget(budget: UsageBudget, file = usageBudgetPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(budget, null, 2)}\n`, 'utf-8');
}
