import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { SearchSourceStats } from './source-stats.js';

test('source-stats: 按源×意图累计调用/成功/耗时', () => {
  const dir = mkdtempSync(join(tmpdir(), 'source-stats-test-'));
  const db = new SearchSourceStats(join(dir, 'stats.db'));
  try {
    db.record('bocha', 'factual', true, 200);
    db.record('bocha', 'factual', false, 350);
    db.record('anysearch', 'news', true, 900);
    const rows = db.summary();
    const bocha = rows.find((r) => r.source === 'bocha' && r.intent === 'factual');
    const any = rows.find((r) => r.source === 'anysearch' && r.intent === 'news');
    assert.equal(bocha?.calls, 2);
    assert.equal(bocha?.okCalls, 1);
    assert.equal(bocha?.totalMs, 550);
    assert.equal(any?.calls, 1);
    assert.equal(any?.okCalls, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
