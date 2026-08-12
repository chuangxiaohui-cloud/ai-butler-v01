import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { HeartbeatMonitor } from './heartbeat.js';

test('heartbeat: 连续失败且超过检测窗口才标记 down', () => {
  const monitor = new HeartbeatMonitor();
  const t0 = 1_000_000;
  monitor.record('bocha', true, t0);
  monitor.record('bocha', false, t0 + 1000); // 第 1 次失败，未超窗
  assert.equal(monitor.isHealthy('bocha'), true);
  monitor.record('bocha', false, t0 + 6000); // 第 2 次失败，距成功 ≥5s
  assert.equal(monitor.isHealthy('bocha'), false);
  assert.equal(monitor.summary().bocha.downAt, t0 + 6000);
});

test('heartbeat: 成功恢复后重新健康', () => {
  const monitor = new HeartbeatMonitor();
  const t0 = 1_000_000;
  monitor.record('anysearch', true, t0);
  monitor.record('anysearch', false, t0 + 6000);
  monitor.record('anysearch', false, t0 + 11_000);
  assert.equal(monitor.isHealthy('anysearch'), false);
  monitor.record('anysearch', true, t0 + 12_000);
  assert.equal(monitor.isHealthy('anysearch'), true);
  assert.equal(monitor.summary().anysearch.consecutiveFailures, 0);
});

test('heartbeat: 未记录过的 provider 默认健康', () => {
  const monitor = new HeartbeatMonitor();
  assert.equal(monitor.isHealthy('tavily'), true);
});
