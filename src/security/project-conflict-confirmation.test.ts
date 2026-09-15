import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { DecisionLog } from '../escalation/decision-log.js';
import { closeJsonl } from '../log/jsonl.js';
import { queueProjectTransactionConflictDecision } from './project-conflict-confirmation.js';
import type { ProjectTransactionConflictDecision } from './project-transaction.js';

test('project-conflict-confirmation: pending 与三种选择均只记录、不写目标文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'project-conflict-confirmation-'));
  const logPath = join(dir, 'decision-log.jsonl');
  const target = join(dir, 'target.txt');
  const log = new DecisionLog(logPath);
  writeFileSync(target, 'external-version', 'utf-8');
  try {
    const contract: ProjectTransactionConflictDecision = {
      kind: 'project_transaction_conflict',
      transactionId: 'tx-1',
      snapshotDir: join(dir, 'snapshot'),
      conflicts: [{
        path: target,
        kind: 'modified',
        existedAtSnapshot: true,
        existsNow: true,
        snapshotSha256: 'a'.repeat(64),
        currentSha256: 'b'.repeat(64),
        proposedSha256: 'c'.repeat(64),
      }],
      options: [
        { id: 'keep_external', label: '保留外部版本', description: '保留当前文件。' },
        { id: 'use_transaction', label: '使用事务版本', description: '使用事务内容。' },
        { id: 'cancel_all', label: '取消整批', description: '不写任何文件。' },
      ],
      defaultChoice: 'cancel_all',
      requiresConfirmation: true,
    };
    for (const [choiceId, outcome] of [
      ['keep_external', 'approve'],
      ['use_transaction', 'approve'],
      ['cancel_all', 'reject'],
    ] as const) {
      const pending = queueProjectTransactionConflictDecision(log, contract, {
        conversationId: 'conv-1',
      });
      assert.deepEqual(pending.choices?.map((choice) => choice.id), [
        'keep_external',
        'use_transaction',
        'cancel_all',
      ]);
      assert.equal(pending.defaultChoice, 'cancel_all');
      assert.equal(pending.requiresConfirmation, true);
      assert.equal(pending.context?.transactionId, 'tx-1');
      const selected = log.adjudicateChoice(pending.id, choiceId);
      assert.equal(selected.ok, true);
      if (!selected.ok) continue;
      assert.equal(selected.entry.selectedChoice, choiceId);
      assert.equal(selected.entry.decision, outcome);
      assert.equal(readFileSync(target, 'utf-8'), 'external-version');
    }
    assert.doesNotMatch(readFileSync(logPath, 'utf-8'), /external-version/);
  } finally {
    log.close();
    closeJsonl(logPath);
    rmSync(dir, { recursive: true, force: true });
  }
});
