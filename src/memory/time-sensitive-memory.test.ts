import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { DAY_MS } from './confidence-decay.js';
import {
  classifyTimeSensitiveMemory,
  isTimeSensitiveMemoryStale,
  timeSensitiveMemoryExpiresAt,
} from './time-sensitive-memory.js';

test('time-sensitive-memory: 仅识别库存、价格、版本与排期事实', () => {
  assert.equal(classifyTimeSensitiveMemory('STM32F103 当前库存还有 120 片'), 'inventory');
  assert.equal(classifyTimeSensitiveMemory('供应商最新报价为每片 18 元'), 'price');
  assert.equal(classifyTimeSensitiveMemory('项目当前使用固件版本 v2.3'), 'version');
  assert.equal(classifyTimeSensitiveMemory('样机交付排期在下个月'), 'schedule');
  assert.equal(classifyTimeSensitiveMemory('用户偏好 KiCad EDA'), null);
});

test('time-sensitive-memory: 到达 P-93 老化检查点后标记过期', () => {
  const createdAt = 1_000;
  const expiresAt = timeSensitiveMemoryExpiresAt('inventory', createdAt);
  assert.equal(isTimeSensitiveMemoryStale(expiresAt, createdAt + 89 * DAY_MS), false);
  assert.equal(isTimeSensitiveMemoryStale(expiresAt, createdAt + 90 * DAY_MS), true);
});
