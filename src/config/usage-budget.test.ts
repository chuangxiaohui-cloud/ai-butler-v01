import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readUsageBudget, writeUsageBudget } from './usage-budget.js';

test('usage-budget: 默认 90% 阈值，读写持久化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-budget-'));
  const file = join(dir, 'usage-budget.json');
  try {
    const empty = readUsageBudget(file);
    assert.equal(empty.budgetYuan, null);
    assert.equal(empty.degradeAtPercent, 90);
    writeUsageBudget({ budgetYuan: 50, degradeAtPercent: 90 }, file);
    assert.deepEqual(readUsageBudget(file), { budgetYuan: 50, degradeAtPercent: 90 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
