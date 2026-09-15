import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  AnswerPostprocessRuleStore,
  PersistedAnswerPostprocessRuntime,
} from './answer-postprocess-store.js';
import type { SkillCandidateEntry } from '../feedback/skill-candidate-store.js';

const ACCEPTED: SkillCandidateEntry = {
  id: 'candidate-1',
  userId: 'u1',
  pattern: 'conclusion_first',
  title: '结论优先回复',
  description: '回复开头先给结论或明确建议。',
  sampleCount: 10,
  latestSample: '结论：先检查电源。',
  status: 'accepted',
  createdAt: 1,
  updatedAt: 2,
};

test('answer-postprocess-store: 启用/停用 append-only 且按用户执行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'answer-postprocess-store-'));
  const store = new AnswerPostprocessRuleStore(join(dir, 'rules.jsonl'));
  try {
    const enabled = store.enable(ACCEPTED, 3);
    assert.equal(enabled?.status, 'enabled');
    const runtime = new PersistedAnswerPostprocessRuntime(store);
    assert.equal(runtime.apply('先检查电源。', { query: '如何排查', userId: 'u1' }).answer, '结论：先检查电源。');
    assert.equal(store.latest()[0].usageCount, 1);
    assert.equal(runtime.apply('先检查电源。', { query: '如何排查', userId: 'u2' }).answer, '先检查电源。');
    assert.equal(store.disable(enabled!.id, 'u1', 4)?.status, 'disabled');
    assert.equal(store.all().length, 3);
    assert.equal(runtime.apply('先检查电源。', { query: '如何排查', userId: 'u1' }).answer, '先检查电源。');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('answer-postprocess-store: 复审恢复只清状态并保留统计与启用状态', () => {
  const dir = mkdtempSync(join(tmpdir(), 'answer-postprocess-review-'));
  const store = new AnswerPostprocessRuleStore(join(dir, 'rules.jsonl'));
  try {
    const enabled = store.enable(ACCEPTED, 3)!;
    store.syncReviewSignals(enabled.name, 'u1', 3, 3, 4);
    const reviewed = store.latest()[0];
    assert.equal(reviewed.needsReview, true);
    assert.equal(reviewed.status, 'enabled');
    assert.equal(reviewed.thumbsDownCount, 3);
    assert.equal(reviewed.consecutiveDown, 3);
    const restored = store.clearReview(enabled.id, 'u1', 5);
    assert.equal(restored?.needsReview, false);
    assert.equal(restored?.consecutiveDown, 0);
    assert.equal(restored?.thumbsDownCount, 3);
    assert.equal(restored?.usageCount, 0);
    assert.equal(restored?.status, 'enabled');
    assert.equal(store.all().length, 3);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('answer-postprocess-store: 未接受或非确定性候选拒绝启用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'answer-postprocess-store-'));
  const store = new AnswerPostprocessRuleStore(join(dir, 'rules.jsonl'));
  try {
    assert.equal(store.enable({ ...ACCEPTED, status: 'proposed' }), null);
    assert.equal(store.enable({ ...ACCEPTED, pattern: 'structured_steps' }), null);
    assert.equal(store.all().length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
