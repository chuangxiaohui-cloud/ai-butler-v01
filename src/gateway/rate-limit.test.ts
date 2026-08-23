import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { ConcurrencyGate, RateLimiter } from './rate-limit.js';

test('rate-limit: 窗口内放行到上限，超限拒绝，窗口过后重置', () => {
  const limiter = new RateLimiter(3, 100);
  const now = 1_000_000;
  assert.equal(limiter.allow('1.2.3.4', now), true);
  assert.equal(limiter.allow('1.2.3.4', now), true);
  assert.equal(limiter.allow('1.2.3.4', now), true);
  assert.equal(limiter.allow('1.2.3.4', now), false);
  // 窗口过后重置为新窗口
  assert.equal(limiter.allow('1.2.3.4', now + 60_001), true);
});

test('rate-limit: 窗口过期后清扫，Map 不永久驻留', () => {
  const limiter = new RateLimiter(10, 2);
  const now = 3_000_000;
  limiter.allow('ip-a', now);
  limiter.allow('ip-b', now);
  // 窗口过期后新 IP 触发清扫：a/b 过期被删，只剩 c
  limiter.allow('ip-c', now + 60_001);
  assert.equal(limiter.size(), 1);
});

test('rate-limit: 超 [P-114] 上限按插入序淘汰最旧，Map 大小受控', () => {
  const limiter = new RateLimiter(10, 2);
  const now = 4_000_000;
  limiter.allow('ip-a', now);
  limiter.allow('ip-b', now);
  limiter.allow('ip-c', now); // 触发淘汰最旧 ip-a
  assert.equal(limiter.size(), 2);
  // ip-a 计数已随淘汰丢失，可重新进入窗口；Map 仍不超过上限
  assert.equal(limiter.allow('ip-a', now), true);
  assert.equal(limiter.size(), 2);
});

test('rate-limit: 并发闸门占满后拒绝，释放后恢复，幂等不越界', () => {
  const gate = new ConcurrencyGate(2);
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), false);
  gate.release();
  assert.equal(gate.tryAcquire(), true);
  gate.release();
  gate.release();
  assert.equal(gate.current(), 0);
});