import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readUsageBudget, writeUsageBudget } from './usage-budget.js';

test('usage-budget: 默认 90% 降级阈值 + §COST 日/月预算启用（P-143/P-144），读写持久化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-budget-'));
  const file = join(dir, 'usage-budget.json');
  try {
    const empty = readUsageBudget(file);
    assert.equal(empty.budgetYuan, null);
    assert.equal(empty.degradeAtPercent, 90);
    assert.equal(empty.dailyBudgetCny, 5);
    assert.equal(empty.monthlyBudgetCny, 150);
    assert.equal(empty.hardStop, false);
    writeUsageBudget(
      {
        budgetYuan: 50,
        degradeAtPercent: 90,
        dailyBudgetCny: 5,
        monthlyBudgetCny: 150,
        hardStop: true,
      },
      file,
    );
    assert.deepEqual(readUsageBudget(file), {
      budgetYuan: 50,
      degradeAtPercent: 90,
      dailyBudgetCny: 5,
      monthlyBudgetCny: 150,
      hardStop: true,
    });
    writeUsageBudget(
      { budgetYuan: 10, degradeAtPercent: 90, dailyBudgetCny: null, monthlyBudgetCny: null, hardStop: false },
      file,
    );
    assert.deepEqual(readUsageBudget(file), {
      budgetYuan: 10,
      degradeAtPercent: 90,
      dailyBudgetCny: null,
      monthlyBudgetCny: null,
      hardStop: false,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
