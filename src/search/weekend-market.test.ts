import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { weekendMarketReply } from './weekend-market.js';

test('weekend-market: 周日股市问题返回休市', () => {
  const sunday = new Date('2026-08-16T10:00:00+08:00');
  const reply = weekendMarketReply('今天股市怎么样', sunday);
  assert.ok(reply);
  assert.ok(reply.includes('休市'));
});

test('weekend-market: 工作日股市问题不拦截', () => {
  const monday = new Date('2026-08-17T10:00:00+08:00');
  assert.equal(weekendMarketReply('今天股市怎么样', monday), null);
});

test('weekend-market: 非股市问题不拦截', () => {
  assert.equal(weekendMarketReply('今天天气怎么样', new Date('2026-08-16T10:00:00+08:00')), null);
});
