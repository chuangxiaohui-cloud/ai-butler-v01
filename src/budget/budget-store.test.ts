import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BudgetStore } from './budget-store.js';

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'budget-test-'));
  return join(dir, 'budget.db');
}

test('budget: 拨款/支出/余额 与多 scope 汇总', () => {
  const db = tempDb();
  const store = new BudgetStore(db);
  try {
    store.add({ scope: '打样费', kind: 'allocate', amount: 100 });
    store.add({ scope: '打样费', kind: 'spend', amount: 80 });
    store.add({ scope: '电容', kind: 'spend', amount: 20 });
    const rows = store.summary();
    assert.equal(rows.length, 2);
    const sample = rows.find((r) => r.scope === '打样费');
    assert.ok(sample);
    assert.equal(sample.allocated, 100);
    assert.equal(sample.spent, 80);
    assert.equal(sample.balance, 20);
    const single = store.summary('电容');
    assert.equal(single[0]?.allocated, 0);
    assert.equal(single[0]?.spent, 20);
    assert.equal(single[0]?.balance, -20);
    assert.equal(store.summary('不存在').length, 0);
  } finally {
    store.close();
    rmSync(join(db, '..'), { recursive: true, force: true });
  }
});

test('budget: recent 时间倒序且有界', () => {
  const db = tempDb();
  const store = new BudgetStore(db);
  try {
    for (let i = 0; i < 6; i += 1) {
      store.add({ scope: '打样费', kind: 'spend', amount: i + 1, createdAt: 1000 + i });
    }
    const recent = store.recent(3);
    assert.equal(recent.length, 3);
    assert.equal(recent[0].amount, 6);
    assert.equal(recent[2].amount, 4);
    assert.equal(recent[0].scope, '打样费');
  } finally {
    store.close();
    rmSync(join(db, '..'), { recursive: true, force: true });
  }
});
