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

test('decision-log: E323 裁决回填——openDecisions 聚合 + adjudicate 追加不改写原行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision-adjudicate-'));
  const file = join(dir, 'decision-log.jsonl');
  const log = new DecisionLog(file);
  try {
    const p1 = log.record({
      trigger: 'human_arbitration',
      question: '选 A 还是 B？',
      options: ['A', 'B'],
      decision: 'pending',
      conversationId: 'conv-1',
      confidence: 0.6,
    });
    const p2 = log.record({
      trigger: 'human_arbitration',
      question: '必须澄清：指哪个器件？',
      decision: 'pending',
      conversationId: 'conv-2',
    });
    // 非 pending 行不进队列
    log.record({
      trigger: 'escalation',
      question: '连续失败升级',
      decision: 'escalate',
      note: 'consecutive_failure',
      conversationId: 'conv-3',
    });
    assert.deepEqual(
      log.openDecisions().map((e) => e.id),
      [p1.id, p2.id],
      '仅 pending 且未被裁决的行入队，保持 append 顺序',
    );

    const result = log.adjudicate(p1.id, 'approve', { note: '选 A' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.entry.decision, 'approve');
    assert.equal(result.entry.refId, p1.id, '裁决事件指向原 pending 行');
    assert.equal(result.entry.question, p1.question, '裁决事件自描述复制 question');
    assert.equal(result.entry.note, '选 A');
    assert.equal(result.entry.conversationId, 'conv-1', '缺省沿用原行会话');
    assert.equal(result.entry.confidence, 0.6, '缺省沿用原行置信度');

    // append-only：原行未被改写，仍为 pending
    const raw = log.recent(10);
    const original = raw.find((e) => e.id === p1.id);
    assert.equal(original?.decision, 'pending', '原行保持 pending 不被改写');
    assert.equal(original?.note, undefined);
    assert.equal(raw.length, 4, '裁决 = 追加一条事件');

    // 队列只剩 p2；二次裁决同一 id 拒绝
    assert.deepEqual(
      log.openDecisions().map((e) => e.id),
      [p2.id],
    );
    assert.deepEqual(log.adjudicate(p1.id, 'reject'), {
      ok: false,
      reason: 'already_decided',
    });
    assert.deepEqual(log.adjudicate('no-such-id', 'reject'), {
      ok: false,
      reason: 'not_found',
    });
    // 非 pending 行（escalate）不可裁决
    assert.deepEqual(log.adjudicate(raw.find((e) => e.decision === 'escalate')!.id, 'reject'), {
      ok: false,
      reason: 'not_found',
    });

    // 备注/会话可显式覆盖
    const override = log.adjudicate(p2.id, 'reject', { note: '指 STM32', conversationId: 'conv-x' });
    assert.equal(override.ok, true);
    if (!override.ok) return;
    assert.equal(override.entry.decision, 'reject');
    assert.equal(override.entry.conversationId, 'conv-x');
    assert.equal(override.entry.refId, p2.id);
    assert.deepEqual(log.openDecisions(), [], '全部裁决后队列清空');
  } finally {
    log.close();
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('decision-log: E324 pendingForConversation 只返回带 resume 的最近 open pending', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision-pending-conv-'));
  const file = join(dir, 'decision-log.jsonl');
  const log = new DecisionLog(file);
  try {
    const plain = log.record({
      trigger: 'human_arbitration',
      question: '请补充信息',
      decision: 'pending',
      conversationId: 'conv-x',
    });
    const first = log.record({
      trigger: 'human_arbitration',
      question: '待批准动作 1',
      decision: 'pending',
      resume: { query: '请求 1', executor: 'project_writer' },
      conversationId: 'conv-x',
    });
    const second = log.record({
      trigger: 'human_arbitration',
      question: '待批准动作 2',
      decision: 'pending',
      resume: { query: '请求 2', executor: 'content_writer' },
      conversationId: 'conv-x',
    });
    log.record({
      trigger: 'human_arbitration',
      question: '别的会话',
      decision: 'pending',
      resume: { query: '请求 3', executor: 'office_daily' },
      conversationId: 'conv-y',
    });
    // 不带 resume 的 pending 不进恢复队列
    assert.equal(log.pendingForConversation('conv-x')?.id, second.id, '返回最近一条带 resume 的 open pending');
    assert.equal(log.pendingForConversation('conv-x')?.resume?.query, '请求 2');
    // plain（无 resume）不干扰结果
    assert.ok(plain.id);
    // 裁决后不再返回
    const result = log.adjudicate(second.id, 'approve');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.resume?.query, '请求 2', '裁决结果应带回原 pending 的 resume 载荷（供批准后恢复执行）');
    assert.equal(log.pendingForConversation('conv-x')?.id, first.id, '裁决后回退到上一条带 resume 的 pending');
    assert.equal(log.pendingForConversation('conv-no-such'), null);
  } finally {
    log.close();
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('decision-log: E396 结构化 choice 必须显式选择并追加决策证据', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision-choice-'));
  const file = join(dir, 'decision-log.jsonl');
  const log = new DecisionLog(file);
  try {
    const pending = log.record({
      trigger: 'human_arbitration',
      question: '冲突如何处理？',
      options: ['保留外部版本', '使用事务版本', '取消整批'],
      choices: [
        { id: 'keep_external', label: '保留外部版本', outcome: 'approve' },
        { id: 'use_transaction', label: '使用事务版本', outcome: 'approve' },
        { id: 'cancel_all', label: '取消整批', outcome: 'reject' },
      ],
      defaultChoice: 'cancel_all',
      requiresConfirmation: true,
      context: { kind: 'project_transaction_conflict', transactionId: 'tx-1' },
      decision: 'pending',
    });
    assert.deepEqual(log.adjudicate(pending.id, 'approve'), {
      ok: false,
      reason: 'choice_required',
    });
    assert.deepEqual(log.adjudicateChoice(pending.id, 'not-an-option'), {
      ok: false,
      reason: 'invalid_choice',
    });
    const result = log.adjudicateChoice(pending.id, 'cancel_all', { note: '保持现状' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.entry.decision, 'reject');
    assert.equal(result.entry.selectedChoice, 'cancel_all');
    assert.equal(result.entry.refId, pending.id);
    assert.equal(result.entry.context?.transactionId, 'tx-1');
    assert.equal(log.all().find((entry) => entry.id === pending.id)?.selectedChoice, undefined);
    assert.deepEqual(log.adjudicateChoice(pending.id, 'use_transaction'), {
      ok: false,
      reason: 'already_decided',
    });
  } finally {
    log.close();
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});
