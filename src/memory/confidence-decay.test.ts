import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DAY_MS,
  decayedConfidence,
  injectable,
  shouldArchive,
  weeklyDecayConfidence,
} from './confidence-decay.js';

test('confidence-decay: 30 天内不衰减', () => {
  assert.equal(decayedConfidence(0.8, 29, 'inferred'), 0.8);
  assert.equal(decayedConfidence(0.8, 29, 'user_explicit'), 0.8);
});

test('confidence-decay: inferred 按 30/90 天整档衰减', () => {
  assert.ok(Math.abs(decayedConfidence(0.8, 30, 'inferred') - 0.72) < 1e-9);
  assert.ok(Math.abs(decayedConfidence(0.8, 90, 'inferred') - 0.56) < 1e-9);
});

test('confidence-decay: user_explicit/corrected 衰减速率减半', () => {
  const half30 = 1 - (1 - 0.9) / 2;
  const half90 = 1 - (1 - 0.7) / 2;
  assert.ok(Math.abs(decayedConfidence(0.8, 30, 'user_explicit') - 0.8 * half30) < 1e-9);
  assert.ok(Math.abs(decayedConfidence(0.8, 90, 'corrected') - 0.8 * half90) < 1e-9);
});

test('confidence-decay: 归档/注入门槛', () => {
  assert.equal(shouldArchive(0.29), true);
  assert.equal(shouldArchive(0.3), false);
  assert.equal(injectable(0.6), true);
  assert.equal(injectable(0.59), false);
});

test('confidence-decay: 周衰减与原有公式一致', () => {
  const now = Date.now();
  const last = now - 2 * 7 * DAY_MS;
  assert.ok(Math.abs(weeklyDecayConfidence(0.5, last, now) - 0.5 * 0.9 ** 2) < 1e-9);
});
