import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { detectCorrectionPattern, SkillCandidateStore } from './skill-candidate-store.js';

test('skill-candidate: 只识别明确的确定性修订模式', () => {
  assert.equal(detectCorrectionPattern('原回答', '结论：应优先检查电源。')?.key, 'conclusion_first');
  assert.equal(detectCorrectionPattern('原回答', '1. 检查电源\n2. 检查时钟')?.key, 'structured_steps');
  assert.equal(detectCorrectionPattern('原回答', '换一种说法即可'), null);
});

test('skill-candidate: 同用户同模式幂等提案，决定采用 append-only 留痕', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-candidate-'));
  const store = new SkillCandidateStore(join(dir, 'candidates.jsonl'));
  try {
    const first = store.propose({
      userId: 'u1',
      pattern: 'conclusion_first',
      title: '结论优先回复',
      description: '回复先给结论。',
      sampleCount: 10,
      latestSample: '结论：优先检查电源。',
    }, 1);
    const duplicate = store.propose({
      userId: 'u1',
      pattern: 'conclusion_first',
      title: '结论优先回复',
      description: '回复先给结论。',
      sampleCount: 11,
      latestSample: '结论：优先检查时钟。',
    }, 2);
    assert.equal(duplicate.id, first.id);
    assert.equal(store.latest().length, 1);
    assert.equal(store.decide(first.id, 'accepted', 3)?.status, 'accepted');
    assert.equal(store.all().length, 2);
    assert.equal(store.latest()[0].status, 'accepted');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
