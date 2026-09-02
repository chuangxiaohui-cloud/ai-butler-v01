import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { closeJsonl } from '../log/jsonl.js';
import { EscalationState } from './escalation-state.js';

test('escalation-state: 连续失败计数与成功归零', () => {
  const dir = mkdtempSync(join(tmpdir(), 'escalation-state-'));
  const file = join(dir, 'state.jsonl');
  const state = new EscalationState(file);
  try {
    assert.equal(state.consecutiveFailures('c1'), 0);
    state.recordFailure('c1', 'search_empty');
    state.recordFailure('c1');
    assert.equal(state.consecutiveFailures('c1'), 2);
    assert.equal(state.failureThresholdReached('c1'), false);
    state.recordFailure('c1');
    assert.equal(state.consecutiveFailures('c1'), 3);
    assert.equal(state.failureThresholdReached('c1'), true);
    state.recordSuccess('c1');
    assert.equal(state.consecutiveFailures('c1'), 0);
  } finally {
    state.close();
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('escalation-state: 多会话隔离', () => {
  const dir = mkdtempSync(join(tmpdir(), 'escalation-state-multi-'));
  const file = join(dir, 'state.jsonl');
  const state = new EscalationState(file);
  try {
    state.recordFailure('c1');
    state.recordFailure('c2');
    state.recordFailure('c1');
    assert.equal(state.consecutiveFailures('c1'), 2);
    assert.equal(state.consecutiveFailures('c2'), 1);
    // 未记录会话返回 0
    assert.equal(state.consecutiveFailures('c3'), 0);
  } finally {
    state.close();
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});
