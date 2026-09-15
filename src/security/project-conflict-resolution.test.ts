import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { DecisionLog } from '../escalation/decision-log.js';
import { closeJsonl } from '../log/jsonl.js';
import { queueProjectTransactionConflictDecision } from './project-conflict-confirmation.js';
import { resolveProjectTransactionConflict } from './project-conflict-resolution.js';
import {
  commitProjectTransaction,
  prepareProjectTransaction,
  type PreparedProjectTransaction,
  type ProjectTransactionConflictChoice,
  type ProjectTransactionConflictDecision,
} from './project-transaction.js';

function fixture(): {
  root: string;
  first: string;
  second: string;
  transaction: PreparedProjectTransaction;
  contract: ProjectTransactionConflictDecision;
  log: DecisionLog;
  logPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'project-conflict-resolution-'));
  const first = join(root, 'projects', 'demo', 'a.txt');
  const second = join(root, 'projects', 'demo', 'b.txt');
  mkdirSync(dirname(first), { recursive: true });
  writeFileSync(first, 'old-a', 'utf-8');
  writeFileSync(second, 'old-b', 'utf-8');
  const prepared = prepareProjectTransaction([
    { path: first, content: 'new-a' },
    { path: second, content: 'new-b' },
  ], { workspaceRoot: root, snapshotRoot: join(root, 'data', 'writer-transactions') });
  if (!prepared.ok) throw new Error(prepared.error);
  assert.equal(prepared.ok, true);
  writeFileSync(first, 'external-a', 'utf-8');
  const conflict = commitProjectTransaction(prepared.transaction);
  assert.equal(conflict.status, 'conflict');
  assert.ok(conflict.decision);
  const logPath = join(root, 'decision-log.jsonl');
  return {
    root,
    first,
    second,
    transaction: prepared.transaction,
    contract: conflict.decision!,
    log: new DecisionLog(logPath),
    logPath,
  };
}

function recordChoice(
  context: ReturnType<typeof fixture>,
  choice: ProjectTransactionConflictChoice,
): string {
  const pending = queueProjectTransactionConflictDecision(context.log, context.contract);
  const result = context.log.adjudicateChoice(pending.id, choice);
  if (!result.ok) throw new Error(result.reason);
  assert.equal(result.ok, true);
  return result.entry.id;
}

function cleanup(context: ReturnType<typeof fixture>): void {
  context.log.close();
  closeJsonl(context.logPath);
  rmSync(context.root, { recursive: true, force: true });
}

test('project-conflict-resolution: 缺失或错事务裁决证据时拒绝执行', () => {
  const context = fixture();
  try {
    const result = resolveProjectTransactionConflict(
      context.transaction,
      context.contract,
      context.log,
      'missing-event',
    );
    assert.equal(result.status, 'invalid_decision');
    const eventId = recordChoice(context, 'use_transaction');
    const wrongContract = { ...context.contract, transactionId: 'another-transaction' };
    const wrong = resolveProjectTransactionConflict(
      context.transaction,
      wrongContract,
      context.log,
      eventId,
    );
    assert.equal(wrong.status, 'invalid_decision');
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'old-b');
  } finally {
    cleanup(context);
  }
});

test('project-conflict-resolution: cancel_all 保留整批当前状态', () => {
  const context = fixture();
  try {
    const result = resolveProjectTransactionConflict(
      context.transaction,
      context.contract,
      context.log,
      recordChoice(context, 'cancel_all'),
    );
    assert.equal(result.status, 'cancelled');
    assert.equal(result.ok, true);
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'old-b');
  } finally {
    cleanup(context);
  }
});

test('project-conflict-resolution: 确认后状态变化重新阻断并返回新契约', () => {
  const context = fixture();
  try {
    const eventId = recordChoice(context, 'use_transaction');
    writeFileSync(context.first, 'external-a-v2', 'utf-8');
    const result = resolveProjectTransactionConflict(
      context.transaction,
      context.contract,
      context.log,
      eventId,
    );
    assert.equal(result.status, 'reconfirmation_required');
    assert.equal(result.decision?.requiresConfirmation, true);
    assert.equal(result.decision?.conflicts.length, 1);
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a-v2');
    assert.equal(readFileSync(context.second, 'utf-8'), 'old-b');
  } finally {
    cleanup(context);
  }
});

test('project-conflict-resolution: keep_external 保留冲突文件并提交其余文件', () => {
  const context = fixture();
  try {
    const result = resolveProjectTransactionConflict(
      context.transaction,
      context.contract,
      context.log,
      recordChoice(context, 'keep_external'),
    );
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.preservedPaths, [context.first]);
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'new-b');
  } finally {
    cleanup(context);
  }
});

test('project-conflict-resolution: use_transaction 成功提交整批', () => {
  const context = fixture();
  try {
    const result = resolveProjectTransactionConflict(
      context.transaction,
      context.contract,
      context.log,
      recordChoice(context, 'use_transaction'),
    );
    assert.equal(result.status, 'completed');
    assert.equal(readFileSync(context.first, 'utf-8'), 'new-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'new-b');
  } finally {
    cleanup(context);
  }
});

test('project-conflict-resolution: 新快照使提交失败回滚到确认时外部版本', () => {
  const context = fixture();
  try {
    let replaces = 0;
    const result = resolveProjectTransactionConflict(
      context.transaction,
      context.contract,
      context.log,
      recordChoice(context, 'use_transaction'),
      {
        commit: {
          replaceFile: (from, to) => {
            replaces += 1;
            if (replaces === 2) throw new Error('replace failed');
            renameSync(from, to);
          },
        },
      },
    );
    assert.equal(result.status, 'rolled_back');
    assert.equal(readFileSync(context.first, 'utf-8'), 'external-a');
    assert.equal(readFileSync(context.second, 'utf-8'), 'old-b');
  } finally {
    cleanup(context);
  }
});
