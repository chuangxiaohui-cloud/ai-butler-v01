import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseBudgetQuery, runBudgetCommand } from './expense.js';

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'expense-test-'));
  return join(dir, 'budget.db');
}

test('expense: 解析 查预算（全部）', () => {
  const parsed = parseBudgetQuery('查预算');
  assert.equal(parsed.action, 'query');
  assert.equal(parsed.scope, undefined);
});

test('expense: 解析 查指定预算', () => {
  const parsed = parseBudgetQuery('查打样费预算');
  assert.equal(parsed.action, 'query');
  assert.equal(parsed.scope, '打样费');
});

test('expense: 解析 拨款设预算', () => {
  const parsed = parseBudgetQuery('给打样费设 100 元预算');
  assert.equal(parsed.action, 'allocate');
  assert.equal(parsed.amount, 100);
  assert.equal(parsed.scope, '打样费');
});

test('expense: 解析 记一笔支出', () => {
  const parsed = parseBudgetQuery('记一笔 80 元打样费');
  assert.equal(parsed.action, 'record');
  assert.equal(parsed.amount, 80);
  assert.equal(parsed.scope, '打样费');
});

test('expense: 解析 买了支出（金额后短语兜底）', () => {
  const parsed = parseBudgetQuery('买了 20 元电容');
  assert.equal(parsed.action, 'record');
  assert.equal(parsed.amount, 20);
  assert.equal(parsed.scope, '电容');
});

test('expense: 解析 无金额 → 归因提示', () => {
  const parsed = parseBudgetQuery('记一笔打样费');
  assert.equal(parsed.action, 'unknown');
  assert.ok(parsed.error?.includes('金额'));
});

test('expense: 全链 拨款→支出→查预算 余额正确（temp db）', () => {
  const db = tempDb();
  try {
    const allocate = runBudgetCommand('给打样费设 100 元预算', db);
    assert.equal(allocate.ok, true);
    assert.equal(allocate.action, 'allocate');
    const spend = runBudgetCommand('记一笔 80 元打样费', db);
    assert.equal(spend.ok, true);
    assert.equal(spend.action, 'record');
    const query = runBudgetCommand('查打样费预算', db);
    assert.equal(query.ok, true);
    assert.equal(query.action, 'query');
    assert.equal(query.summary?.[0]?.allocated, 100);
    assert.equal(query.summary?.[0]?.spent, 80);
    assert.equal(query.summary?.[0]?.balance, 20);
  } finally {
    rmSync(join(db, '..'), { recursive: true, force: true });
  }
});
