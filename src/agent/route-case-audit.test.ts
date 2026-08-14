import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeV2 } from './router-v2.js';
import { auditRouteCases } from './route-case-audit.js';

function record(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    timestamp: 1,
    query: `q-${id}`,
    result: routeV2(`帮我写一份 PRD ${id}`),
    ...overrides,
  };
}

test('route-case-audit: 统计来源/决策/反馈与校准进度', () => {
  const audit = auditRouteCases([
    record('a', { source: 'seed', feedback: 'reject', correctedRoute: { primaryLens: 'product_manager', intent: 'write_doc' } }),
    record('b', { source: 'pipeline', feedback: 'accept' }),
    record('c', { source: 'pipeline' }),
  ]);
  assert.equal(audit.total, 3);
  assert.equal(audit.bySource.pipeline, 2);
  assert.equal(audit.byDecision.direct, 3);
  assert.equal(audit.calibrationProgress.accepted, 1);
  assert.equal(audit.calibrationProgress.rejected, 1);
  assert.equal(audit.calibrationProgress.ready, false);
  assert.deepEqual(audit.issues, []);
});

test('route-case-audit: 质量问题被检出', () => {
  const audit = auditRouteCases([
    record('dup', { feedback: 'reject' }),
    record('dup', { feedback: 'correct' }),
    record('bad', { feedback: 'reject' }),
  ]);
  assert.ok(audit.issues.some((issue) => issue.includes('重复 id')));
  assert.ok(audit.issues.some((issue) => issue.includes('缺少 correctedRoute')));
});
