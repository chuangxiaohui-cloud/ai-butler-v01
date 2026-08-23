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

test('route-case-store: attachModelRoute 回写模型路由信息', () => {
  const dir = mkdtempSync(join(tmpdir(), 'route-case-model-route-'));
  const file = join(dir, 'route-cases.jsonl');
  try {
    const store = new RouteCaseStore(file);
    const id = store.record(routeV2('帮我查一下 STM32 主频'), { source: 'pipeline' });
    const ok = store.attachModelRoute(id, {
      tier: 'medium',
      provider: 'deepseek',
      model: 'deepseek-chat',
      fallbacks: [{ from: 'deepseek', to: 'zhipu' }],
      at: 42,
    });
    assert.equal(ok, true);
    const records = store.list();
    assert.equal(records[0]?.modelRoute?.tier, 'medium');
    assert.equal(records[0]?.modelRoute?.provider, 'deepseek');
    assert.deepEqual(records[0]?.modelRoute?.fallbacks, [{ from: 'deepseek', to: 'zhipu' }]);
    assert.equal(store.attachModelRoute('missing', { tier: 'heavy', provider: 'x', model: 'y', fallbacks: [], at: 1 }), false);
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
    timestamp: Date.now() - i * 1000,
    query: `q${i}`,
    result: r.result as never,
    feedback: 'reject' as const,
  }));
  const suggestion = calibrateThresholds(records as never);
  assert.ok(suggestion.suggestedLow > 0.45);
  assert.equal(suggestion.rejectedCount, 3);
});

test('confidence-calibration: 该直答却澄清的 reject 不抬高 low 阈值', () => {
  const records = [
    { result: { confidence: 0, decision: { type: 'must_clarify' } } },
    { result: { confidence: 0, decision: { type: 'must_clarify' } } },
    { result: { confidence: 0.7, decision: { type: 'option_clarify' } } },
  ].map((r, i) => ({
    id: `r${i}`,
    timestamp: Date.now() - i * 1000,
    query: `q${i}`,
    result: r.result as never,
    feedback: 'reject' as const,
    correctedRoute: { primaryLens: 'secretary', intent: 'web_search' },
  }));
  const suggestion = calibrateThresholds(records as never);
  assert.ok(suggestion.suggestedLow <= 0.45);
  assert.equal(suggestion.rejectedCount, 3);
});
test('route-case-store: batchMarkFeedback 单趟批量回写 + 部分失败', () => {
  const { store, dir } = tempStore();
  try {
    const a = store.record(routeV2('问题 A'), { source: 't' });
    const b = store.record(routeV2('问题 B'), { source: 't' });
    store.record(routeV2('问题 C'), { source: 't' });
    const result = store.batchMarkFeedback([
      { id: a, feedback: 'accept' },
      { id: b, feedback: 'reject', correctedRoute: { primaryLens: 'secretary', intent: 'web_search' } },
      { id: 'missing', feedback: 'accept' },
    ]);
    assert.deepEqual(result.updated, [a, b]);
    assert.deepEqual(result.failed, ['missing']);
    const byId = new Map(store.list().map((r) => [r.id, r]));
    assert.equal(byId.get(a)?.feedback, 'accept');
    assert.equal(byId.get(b)?.feedback, 'reject');
    assert.deepEqual(byId.get(b)?.correctedRoute, { primaryLens: 'secretary', intent: 'web_search' });
    assert.equal(byId.get(a)?.result.query, '问题 A'); // 未标记字段保留
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('route-case-store: 批量回写后新增 record 仍保留（不丢追加）', () => {
  const { store, dir } = tempStore();
  try {
    const id = store.record(routeV2('回写目标'), { source: 't' });
    const id2 = store.record(routeV2('回写前追加'), { source: 't' });
    const result = store.batchMarkFeedback([{ id, feedback: 'accept' }]);
    assert.deepEqual(result.updated, [id]);
    const records = store.list();
    assert.equal(records.length, 2);
    assert.ok(records.some((r) => r.id === id2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});