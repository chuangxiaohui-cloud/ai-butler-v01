import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PARAMS } from '../config/params.js';
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
test('cache: P7 超容量按 LRU 淘汰最冷条目', () => {
  clearCacheForTests();
  const max = PARAMS.cacheMaxEntries;
  for (let i = 0; i < max; i++) setCache(`k${i}`, `v${i}`, 60_000);
  setCache('overflow', 'v', 60_000);
  assert.equal(getCache('k0'), null); // 最冷先被淘汰
  assert.equal(getCache('k1'), 'v1');
  assert.equal(getCache('overflow'), 'v');
  clearCacheForTests();
});

test('cache: P7 命中刷新 LRU 序，热条目不被先淘汰', () => {
  clearCacheForTests();
  const max = PARAMS.cacheMaxEntries;
  for (let i = 0; i < max; i++) setCache(`k${i}`, `v${i}`, 60_000);
  assert.equal(getCache('k0'), 'v0'); // 命中刷新 k0 为最热
  setCache('overflow', 'v', 60_000);
  assert.equal(getCache('k1'), null); // 最冷变成 k1
  assert.equal(getCache('k0'), 'v0');
  clearCacheForTests();
});

test('cache: P7 超容量先清过期条目再淘汰', () => {
  clearCacheForTests();
  const max = PARAMS.cacheMaxEntries;
  for (let i = 0; i < max; i++) setCache(`k${i}`, `v${i}`, -1); // 全部已过期
  setCache('fresh', 'v', 60_000);
  assert.equal(getCache('k0'), null); // 过期条目被清理
  assert.equal(getCache('fresh'), 'v');
  clearCacheForTests();
});
