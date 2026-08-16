/**
 * Token 预算持久化（E113）
 * UI“Token 用量”写入 data/usage-budget.json；降级阈值引用 P-108。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface UsageBudget {
  budgetYuan: number | null;
  degradeAtPercent: number;
}

const DEFAULT_BUDGET: UsageBudget = {
  budgetYuan: null,
  degradeAtPercent: 90,
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
    };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

export function writeUsageBudget(budget: UsageBudget, file = usageBudgetPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(budget, null, 2)}\n`, 'utf-8');
}
