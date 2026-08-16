import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { aggregateUsage, readUsage, recordUsage } from './usage-store.js';

test('usage-store: 记账并按今日/近7天/本月聚合', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usage-store-'));
  const file = join(dir, 'usage.jsonl');
  const now = Date.UTC(2026, 7, 16, 12, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  try {
    recordUsage({ ts: now, provider: 'deepseek', model: 'deepseek-chat', promptTokens: 100, completionTokens: 50 }, file);
    recordUsage({ ts: now - 2 * day, provider: 'zhipu', model: 'glm-5.2', promptTokens: 200, completionTokens: 100 }, file);
    recordUsage({ ts: now - 30 * day, provider: 'deepseek', model: 'deepseek-chat', promptTokens: 10, completionTokens: 5 }, file);

    assert.equal(readUsage(file).length, 3);
    const stats = aggregateUsage(readUsage(file), now);
    assert.equal(stats.todayTokens, 150);
    assert.equal(stats.weekTokens, 450);
    assert.equal(stats.monthTokens, 450);
    assert.equal(stats.totalTokens, 465);
    assert.equal(stats.byModel['deepseek-chat'].promptTokens, 110);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
