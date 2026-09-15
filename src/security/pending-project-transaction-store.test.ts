import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { DecisionLog } from '../escalation/decision-log.js';
import { closeJsonl } from '../log/jsonl.js';
import { PendingProjectTransactionStore } from './pending-project-transaction-store.js';
import { prepareProjectTransaction, type PreparedProjectTransaction } from './project-transaction.js';

function fixture(audit = false) {
  const root = mkdtempSync(join(tmpdir(), 'pending-project-transaction-'));
  const first = join(root, 'projects', 'demo', 'a.txt');
  const second = join(root, 'projects', 'demo', 'b.txt');
  const decisionPath = join(root, 'decision-log.jsonl');
  const operationPath = join(root, 'operations.jsonl');
  mkdirSync(dirname(first), { recursive: true });
  writeFileSync(first, 'old-a', 'utf-8');
  const prepared = prepareProjectTransaction([
    { path: first, content: 'new-a' },
    { path: second, content: 'new-b' },
  ], {
    workspaceRoot: root,
    snapshotRoot: join(root, 'data', 'writer-transactions'),
    audit: audit ? { userId: 'u1', conversationId: 'conv-1', logPath: operationPath } : undefined,
  });
  if (!prepared.ok) throw new Error(prepared.error);
  return {
    root,
    first,
    second,
    transaction: prepared.transaction,
    decisionPath,
    operationPath,
    log: new DecisionLog(decisionPath),
    store: new PendingProjectTransactionStore(),
  };
}

function queueInitial(
  context: ReturnType<typeof fixture>,
  choice: 'confirm_changes' | 'cancel_all',
): string {
  const transaction = context.transaction as PreparedProjectTransaction;
  const pending = context.log.record({
    trigger: 'human_arbitration',
    question: '确认多文件变更？',
    options: ['确认变更', '取消整批'],
    choices: [
      { id: 'confirm_changes', label: '确认变更', outcome: 'approve' },
      { id: 'cancel_all', label: '取消整批', outcome: 'reject' },
    ],
    defaultChoice: 'cancel_all',
    requiresConfirmation: true,
    context: {
      kind: 'project_multifile_change_confirmation',
      transactionId: transaction.id,
      snapshotDir: transaction.snapshotDir,
    },
    decision: 'pending',
    conversationId: 'conv-1',
  });
  context.store.register(pending.id, transaction, { conversationId: 'conv-1' });
  const selected = context.log.adjudicateChoice(pending.id, choice);
  if (!selected.ok) throw new Error(selected.reason);
  return selected.entry.id;
}

function cleanup(context: ReturnType<typeof fixture>): void {
  context.log.close();
  closeJsonl(context.decisionPath);
  rmSync(context.root, { recursive: true, force: true });
}

function advanceToConflict(
  context: ReturnType<typeof fixture>,
  choice: 'keep_external' | 'use_transaction' | 'cancel_all',
) {
  const initialEventId = queueInitial(context, 'confirm_changes');
  writeFileSync(context.first, 'external-a', 'utf-8');
  const initial = context.store.resolveInitialDecision(context.log, initialEventId);
  assert.equal(initial.status, 'conflict_pending');
  const pendingId = initial.conflictDecisionId ?? '';
  const selected = context.log.adjudicateChoice(pendingId, choice);
  if (!selected.ok) throw new Error(selected.reason);
  return {
    pendingId,
    decisionEventId: selected.entry.id,
  };
}

test('pending-project-transaction-store: confirm_changes 提交 prepared 整批', () => {
  const context = fixture();
  try {
    const result = context.store.resolveInitialDecision(
      context.log,
      queueInitial(context, 'confirm_changes'),
    );
    assert.equal(result.status, 'completed');
    assert.equal(result.ok, true);
    assert.equal(readFileSync(context.first, 'utf-8'), 'new-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'new-b');
    assert.equal(context.store.size(), 0);
  } finally {
    cleanup(context);
  }
});

test('pending-project-transaction-store: cancel_all 清理快照并记录 cancelled', () => {
  const context = fixture(true);
  try {
    const snapshotDir = context.transaction.snapshotDir;
    const result = context.store.resolveInitialDecision(
      context.log,
      queueInitial(context, 'cancel_all'),
    );
    assert.equal(result.status, 'cancelled');
    assert.equal(existsSync(snapshotDir), false);
    assert.equal(readFileSync(context.first, 'utf-8'), 'old-a');
    assert.equal(existsSync(context.second), false);
    const statuses = readFileSync(context.operationPath, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { status: string }).status);
    assert.deepEqual(statuses, ['prepared', 'cancelled']);
  } finally {
    cleanup(context);
  }
});

test('pending-project-transaction-store: 提交前冲突转为三选一 pending 并重绑事务', () => {
  const context = fixture();
  try {
    const eventId = queueInitial(context, 'confirm_changes');
    writeFileSync(context.first, 'external-a', 'utf-8');
    const result = context.store.resolveInitialDecision(context.log, eventId);
    assert.equal(result.status, 'conflict_pending');
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a');
    assert.equal(existsSync(context.second), false);
    const conflict = context.log.openDecisions()[0];
    assert.equal(conflict?.context?.kind, 'project_transaction_conflict');
    assert.deepEqual(conflict?.choices?.map((choice) => choice.id), [
      'keep_external',
      'use_transaction',
      'cancel_all',
    ]);
    assert.equal(context.store.get(result.conflictDecisionId ?? '')?.transaction.id, context.transaction.id);
  } finally {
    cleanup(context);
  }
});

test('pending-project-transaction-store: 进程内事务缺失时诚实返回 expired', () => {
  const context = fixture();
  try {
    const pending = context.log.record({
      trigger: 'human_arbitration',
      question: '确认多文件变更？',
      choices: [
        { id: 'confirm_changes', label: '确认变更', outcome: 'approve' },
        { id: 'cancel_all', label: '取消整批', outcome: 'reject' },
      ],
      defaultChoice: 'cancel_all',
      requiresConfirmation: true,
      context: {
        kind: 'project_multifile_change_confirmation',
        transactionId: context.transaction.id,
      },
      decision: 'pending',
    });
    const selected = context.log.adjudicateChoice(pending.id, 'confirm_changes');
    if (!selected.ok) throw new Error(selected.reason);
    const result = context.store.resolveInitialDecision(context.log, selected.entry.id);
    assert.equal(result.status, 'expired');
    assert.match(result.error ?? '', /原进程内.*失效/);
    assert.equal(readFileSync(context.first, 'utf-8'), 'old-a');
    assert.equal(existsSync(context.second), false);
  } finally {
    cleanup(context);
  }
});

test('pending-project-transaction-store: 冲突 keep_external 保留外部文件并提交其余文件', () => {
  const context = fixture();
  try {
    const { decisionEventId } = advanceToConflict(context, 'keep_external');
    const result = context.store.resolveConflictDecision(context.log, decisionEventId);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.conflictResolution?.preservedPaths, [context.first]);
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'new-b');
    assert.equal(context.store.size(), 0);
  } finally {
    cleanup(context);
  }
});

test('pending-project-transaction-store: 冲突 use_transaction 提交整批事务版本', () => {
  const context = fixture();
  try {
    const { decisionEventId } = advanceToConflict(context, 'use_transaction');
    const result = context.store.resolveConflictDecision(context.log, decisionEventId);
    assert.equal(result.status, 'completed');
    assert.equal(readFileSync(context.first, 'utf-8'), 'new-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'new-b');
    assert.equal(context.store.size(), 0);
  } finally {
    cleanup(context);
  }
});

test('pending-project-transaction-store: 冲突 cancel_all 清理事务且保持当前文件', () => {
  const context = fixture();
  try {
    const snapshotDir = context.transaction.snapshotDir;
    const { decisionEventId } = advanceToConflict(context, 'cancel_all');
    const result = context.store.resolveConflictDecision(context.log, decisionEventId);
    assert.equal(result.status, 'cancelled');
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a');
    assert.equal(existsSync(context.second), false);
    assert.equal(existsSync(snapshotDir), false);
    assert.equal(context.store.size(), 0);
  } finally {
    cleanup(context);
  }
});

test('pending-project-transaction-store: 冲突确认后再次变化生成新 pending 并零写入', () => {
  const context = fixture();
  try {
    const { pendingId, decisionEventId } = advanceToConflict(context, 'use_transaction');
    writeFileSync(context.first, 'external-a-v2', 'utf-8');
    const result = context.store.resolveConflictDecision(context.log, decisionEventId);
    assert.equal(result.status, 'conflict_pending');
    assert.notEqual(result.conflictDecisionId, pendingId);
    assert.equal(context.store.get(pendingId), null);
    assert.equal(context.store.get(result.conflictDecisionId ?? '')?.transaction.id, context.transaction.id);
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a-v2');
    assert.equal(existsSync(context.second), false);
  } finally {
    cleanup(context);
  }
});
