import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { routeV2 } from './router-v2.js';
import { RouteCaseStore } from './route-case-store.js';
import { calibrateThresholds } from './confidence-calibration.js';

function tempStore(): { store: RouteCaseStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'route-case-'));
  return { store: new RouteCaseStore(join(dir, 'route-cases.jsonl')), dir };
}

test('route-case-store: 采集/反馈/统计往返', () => {
  const { store, dir } = tempStore();
  try {
    const id = store.record(routeV2('帮我写一份 PRD'), {
      userId: 'u1',
      source: 'test',
    });
    assert.equal(store.list().length, 1);
    assert.equal(store.recordFeedback(id, 'accept'), true);
    const stats = store.stats();
    assert.equal(stats.total, 1);
    assert.equal(stats.withFeedback, 1);
    assert.equal(stats.feedbackCounts.accept, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('route-case-store: 不存在的反馈 id 返回 false', () => {
  const { store, dir } = tempStore();
  try {
    assert.equal(store.recordFeedback('missing', 'reject'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('confidence-calibration: 拒绝样本抬高 low 阈值', () => {
  const records = [
    { result: { confidence: 0.5 } },
    { result: { confidence: 0.55 } },
    { result: { confidence: 0.6 } },
  ].map((r, i) => ({
    id: `r${i}`,
    timestamp: i,
    query: `q${i}`,
    result: r.result as never,
    feedback: 'reject' as const,
  }));
  const suggestion = calibrateThresholds(records as never);
  assert.ok(suggestion.suggestedLow > 0.45);
  assert.equal(suggestion.rejectedCount, 3);
});
