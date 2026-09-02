import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { closeJsonl } from '../log/jsonl.js';
import { DecisionLog } from './decision-log.js';

test('decision-log: 追加/读取/close', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision-log-'));
  const file = join(dir, 'decision-log.jsonl');
  const log = new DecisionLog(file);
  try {
    const e1 = log.record({
      trigger: 'human_arbitration',
      question: '这个操作有风险，批准还是否决？',
      options: ['批准', '否决'],
      decision: 'pending',
      conversationId: 'conv-1',
      confidence: 0.6,
    });
    assert.ok(e1.id);
    log.record({
      trigger: 'escalation',
      decision: 'escalate',
      note: 'user_correction',
      conversationId: 'conv-1',
    });
    const recent = log.recent(10);
    assert.equal(recent.length, 2);
    assert.equal(recent[1]?.trigger, 'escalation');
    assert.equal(recent[0]?.trigger, 'human_arbitration');
    assert.equal(recent[0]?.decision, 'pending');
    // limit 截断
    assert.equal(log.recent(1).length, 1);
  } finally {
    log.close();
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('decision-log: 文件缺失 recent 返回空', () => {
  const log = new DecisionLog(join(tmpdir(), `no-such-${Date.now()}.jsonl`));
  assert.deepEqual(log.recent(), []);
  log.close();
});
