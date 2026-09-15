import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { FeedbackStore } from './feedback-store.js';

test('feedback-store: 追加保留历史，统计按同一回复最新反馈去重', () => {
  const dir = mkdtempSync(join(tmpdir(), 'answer-feedback-'));
  const store = new FeedbackStore(join(dir, 'feedback.jsonl'));
  try {
    store.record({
      userId: 'u1',
      conversationId: 'c1',
      messageId: 'm1',
      mode: 'knowledge',
      query: '问题',
      answer: '回答',
      feedback: 'accept',
    }, 1);
    store.record({
      userId: 'u1',
      conversationId: 'c1',
      messageId: 'm1',
      mode: 'knowledge',
      query: '问题',
      answer: '回答',
      feedback: 'reject',
      reason: 'technical_error',
      note: '型号参数写错了',
    }, 2);

    assert.equal(store.all().length, 2);
    assert.equal(store.latest().length, 1);
    assert.equal(store.latest()[0].reason, 'technical_error');
    assert.equal(store.latest()[0].note, '型号参数写错了');
    assert.deepEqual(store.stats(), {
      accept: 0,
      reject: 1,
      correct: 0,
      total: 1,
      acceptanceRate: 0,
    });

    store.record({
      userId: 'u1',
      conversationId: 'c1',
      messageId: 'm2',
      mode: 'engineering',
      query: '如何选型？',
      answer: '原回答',
      feedback: 'correct',
      skillName: 'chip-analysis',
      postprocessSkillNames: ['reply-conclusion-first'],
      correctedAnswer: '应优先核对 STM32 的工作温度范围。',
    }, 3);
    assert.equal(store.latest()[1].correctedAnswer, '应优先核对 STM32 的工作温度范围。');
    assert.equal(store.latest()[1].skillName, 'chip-analysis');
    assert.deepEqual(store.latest()[1].postprocessSkillNames, ['reply-conclusion-first']);
    assert.deepEqual(store.stats(), {
      accept: 0,
      reject: 1,
      correct: 1,
      total: 2,
      acceptanceRate: 0,
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('feedback-store: 每日汇总只统计当前用户当日的每条回复最新票', () => {
  const dir = mkdtempSync(join(tmpdir(), 'answer-feedback-daily-'));
  const store = new FeedbackStore(join(dir, 'feedback.jsonl'));
  const now = new Date(2026, 8, 13, 12).getTime();
  const common = {
    userId: 'u1',
    conversationId: 'c1',
    mode: 'knowledge' as const,
    query: '问题',
    answer: '回答',
  };
  try {
    store.record({ ...common, messageId: 'changed', feedback: 'reject' }, now - 4);
    store.record({ ...common, messageId: 'changed', feedback: 'accept' }, now - 3);
    store.record({
      ...common,
      messageId: 'rejected',
      feedback: 'reject',
      reason: 'technical_error',
    }, now - 2);
    store.record({
      ...common,
      messageId: 'corrected',
      feedback: 'correct',
      correctedAnswer: '修订回答',
    }, now - 1);
    store.record({ ...common, userId: 'u2', messageId: 'other-user', feedback: 'reject' }, now);
    store.record({
      ...common,
      messageId: 'yesterday',
      feedback: 'reject',
    }, new Date(2026, 8, 12, 23, 59).getTime());

    assert.deepEqual(store.dailySummary('u1', now), {
      accept: 1,
      reject: 1,
      correct: 1,
      total: 3,
      topRejectReason: 'technical_error',
      text: '今天收到 1 个👎、1 个👍、1 条修改建议，主要原因是“技术错误”。',
    });
    assert.deepEqual(store.dailySummary('u3', now), {
      accept: 0,
      reject: 0,
      correct: 0,
      total: 0,
      text: '今天还没有收到回复反馈。',
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
