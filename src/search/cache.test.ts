import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { clearCacheForTests, getCache, hashQuery, setCache, ttlForIntent } from './cache.js';

test('cache: hashQuery 稳定且定长', () => {
  const a = hashQuery('STM32F103C8T6 最大主频是多少');
  const b = hashQuery('STM32F103C8T6 最大主频是多少');
  assert.equal(a, b);
  assert.equal(a.length, 32);
});

test('cache: TTL 按意图区分', () => {
  assert.equal(ttlForIntent('factual'), 7 * 24 * 60 * 60 * 1000); // [P-61]
  assert.equal(ttlForIntent('experience'), 30 * 24 * 60 * 60 * 1000); // [P-62]
  assert.equal(ttlForIntent('news'), null);
});

test('cache: set/get 往返且过期失效', () => {
  clearCacheForTests();
  setCache('k1', 'v1', 60_000);
  assert.equal(getCache('k1'), 'v1');
  setCache('k2', 'v2', -1);
  assert.equal(getCache('k2'), null);
  clearCacheForTests();
});
