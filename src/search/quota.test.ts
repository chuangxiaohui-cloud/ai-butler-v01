import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { FileMonthlyQuotaStore, FileQuotaStore, readMonthlyQuota, TAVILY_MONTHLY_LIMIT } from './quota.js';

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quota-test-'));
  return join(dir, 'search-quota.json');
}

test('quota: 同日计数并在达限后拒绝', async () => {
  const file = tempFile();
  try {
    const store = new FileQuotaStore(file);
    assert.equal(await store.take('bocha', 2), true);
    assert.equal(await store.take('bocha', 2), true);
    assert.equal(await store.take('bocha', 2), false);
    const state = JSON.parse(readFileSync(file, 'utf-8')) as { counts: Record<string, number> };
    assert.equal(state.counts.bocha, 2);
  } finally {
    rmSync(file, { force: true });
  }
});

test('quota: 不同 key 独立计数', async () => {
  const file = tempFile();
  try {
    const store = new FileQuotaStore(file);
    assert.equal(await store.take('bocha', 1), true);
    assert.equal(await store.take('anysearch', 1), true);
    assert.equal(await store.take('bocha', 1), false);
    assert.equal(await store.take('anysearch', 1), false);
  } finally {
    rmSync(file, { force: true });
  }
});



function tempMonthlyFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'monthly-quota-test-'));
  return join(dir, 'tavily-monthly.json');
}

test('quota: readMonthlyQuota 文件缺失按 0 处理', () => {
  const snap = readMonthlyQuota(tempMonthlyFile(), 'tavily', TAVILY_MONTHLY_LIMIT);
  assert.equal(snap.used, 0);
  assert.equal(snap.remaining, TAVILY_MONTHLY_LIMIT);
  assert.equal(snap.ratio, 0);
});

test('quota: readMonthlyQuota 当月计数与剩余', async () => {
  const file = tempMonthlyFile();
  try {
    const store = new FileMonthlyQuotaStore(file);
    assert.equal(await store.take('tavily', TAVILY_MONTHLY_LIMIT), true);
    assert.equal(await store.take('tavily', TAVILY_MONTHLY_LIMIT), true);
    const snap = readMonthlyQuota(file, 'tavily', TAVILY_MONTHLY_LIMIT);
    assert.equal(snap.used, 2);
    assert.equal(snap.remaining, TAVILY_MONTHLY_LIMIT - 2);
    assert.equal(Math.round(snap.ratio * 1000), 2);
  } finally {
    rmSync(file, { force: true });
  }
});

test('quota: readMonthlyQuota 跨月归零', () => {
  const file = tempMonthlyFile();
  try {
    const stale = JSON.stringify({ month: '1999-01', counts: { tavily: 999 } }, null, 2);
    writeFileSync(file, stale, 'utf-8');
    const snap = readMonthlyQuota(file, 'tavily', TAVILY_MONTHLY_LIMIT);
    assert.equal(snap.used, 0);
    assert.equal(snap.remaining, TAVILY_MONTHLY_LIMIT);
  } finally {
    rmSync(file, { force: true });
  }
});

test('quota: readMonthlyQuota 损坏文件按 0 处理', () => {
  const file = tempMonthlyFile();
  try {
    writeFileSync(file, '{not-json', 'utf-8');
    const snap = readMonthlyQuota(file, 'tavily', TAVILY_MONTHLY_LIMIT);
    assert.equal(snap.used, 0);
  } finally {
    rmSync(file, { force: true });
  }
});

test('quota: P5 并发 take 不丢计数（同实例）', async () => {
  const file = tempFile();
  try {
    const store = new FileQuotaStore(file);
    const results = await Promise.all(Array.from({ length: 10 }, () => store.take('bocha', 10)));
    assert.deepEqual(results, Array(10).fill(true));
    const state = JSON.parse(readFileSync(file, 'utf-8')) as { counts: Record<string, number> };
    assert.equal(state.counts.bocha, 10);
  } finally {
    rmSync(file, { force: true });
  }
});

test('quota: P5 跨实例同文件并发也不丢计数', async () => {
  const file = tempFile();
  try {
    const a = new FileQuotaStore(file);
    const b = new FileQuotaStore(file);
    const results = await Promise.all([
      a.take('bocha', 2),
      b.take('bocha', 2),
      a.take('bocha', 2),
      b.take('bocha', 2),
    ]);
    assert.deepEqual(results, [true, true, false, false]);
    const state = JSON.parse(readFileSync(file, 'utf-8')) as { counts: Record<string, number> };
    assert.equal(state.counts.bocha, 2);
  } finally {
    rmSync(file, { force: true });
  }
});