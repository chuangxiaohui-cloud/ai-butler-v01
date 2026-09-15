import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

import type { DecisionLog } from '../escalation/decision-log.js';
import {
  buildProjectTransactionConflictDecision,
  commitProjectTransaction,
  prepareProjectTransaction,
  type CommitProjectTransactionOptions,
  type CommitProjectTransactionResult,
  type PreparedProjectTransaction,
  type ProjectTransactionConflict,
  type ProjectTransactionConflictChoice,
  type ProjectTransactionConflictDecision,
} from './project-transaction.js';

export interface ResolveProjectTransactionConflictResult {
  ok: boolean;
  status:
    | 'completed'
    | 'cancelled'
    | 'reconfirmation_required'
    | 'invalid_decision'
    | 'prepare_failed'
    | 'stage_failed'
    | 'rolled_back'
    | 'rollback_failed';
  transactionId: string;
  selectedChoice?: ProjectTransactionConflictChoice;
  executionTransactionId?: string;
  committedPaths: string[];
  preservedPaths: string[];
  decision?: ProjectTransactionConflictDecision;
  commit?: CommitProjectTransactionResult;
  error?: string;
}

export function resolveProjectTransactionConflict(
  transaction: PreparedProjectTransaction,
  contract: ProjectTransactionConflictDecision,
  store: DecisionLog,
  decisionEventId: string,
  opts: { commit?: CommitProjectTransactionOptions } = {},
): ResolveProjectTransactionConflictResult {
  const invalid = validateDecisionEvidence(transaction, contract, store, decisionEventId);
  if (invalid.error) {
    return baseResult(transaction, {
      ok: false,
      status: 'invalid_decision',
      committedPaths: [],
      preservedPaths: [],
      error: invalid.error,
    });
  }
  const selectedChoice = invalid.selectedChoice!;
  const changed = collectChangesSinceConfirmation(transaction, contract);
  if (changed.length > 0) {
    return baseResult(transaction, {
      ok: false,
      status: 'reconfirmation_required',
      selectedChoice,
      committedPaths: [],
      preservedPaths: [],
      decision: buildProjectTransactionConflictDecision(transaction, changed),
      error: `确认后又有 ${changed.length} 个文件发生变化`,
    });
  }
  if (selectedChoice === 'cancel_all') {
    return baseResult(transaction, {
      ok: true,
      status: 'cancelled',
      selectedChoice,
      committedPaths: [],
      preservedPaths: transaction.entries.map((entry) => entry.path),
    });
  }

  const conflictPaths = new Set(contract.conflicts.map((conflict) => pathKey(conflict.path)));
  const selectedEntries = selectedChoice === 'keep_external'
    ? transaction.entries.filter((entry) => !conflictPaths.has(pathKey(entry.path)))
    : transaction.entries;
  const preservedPaths = selectedChoice === 'keep_external'
    ? transaction.entries.filter((entry) => conflictPaths.has(pathKey(entry.path))).map((entry) => entry.path)
    : [];
  if (selectedEntries.length === 0) {
    return baseResult(transaction, {
      ok: true,
      status: 'completed',
      selectedChoice,
      committedPaths: [],
      preservedPaths,
    });
  }

  const prepared = prepareProjectTransaction(
    selectedEntries.map((entry) => ({ path: entry.path, content: entry.content })),
    {
      workspaceRoot: transaction.workspaceRoot,
      snapshotRoot: dirname(transaction.snapshotDir),
      audit: transaction.audit,
    },
  );
  if (!prepared.ok) {
    return baseResult(transaction, {
      ok: false,
      status: 'prepare_failed',
      selectedChoice,
      committedPaths: [],
      preservedPaths,
      error: prepared.error,
    });
  }
  const changedDuringPrepare = collectPreparedBaselineChanges(transaction, contract, prepared.transaction);
  if (changedDuringPrepare.length > 0) {
    return baseResult(transaction, {
      ok: false,
      status: 'reconfirmation_required',
      selectedChoice,
      executionTransactionId: prepared.transaction.id,
      committedPaths: [],
      preservedPaths,
      decision: buildProjectTransactionConflictDecision(transaction, changedDuringPrepare),
      error: `准备新快照期间有 ${changedDuringPrepare.length} 个文件发生变化`,
    });
  }
  const commit = commitProjectTransaction(prepared.transaction, opts.commit);
  if (commit.status === 'conflict') {
    return baseResult(transaction, {
      ok: false,
      status: 'reconfirmation_required',
      selectedChoice,
      executionTransactionId: prepared.transaction.id,
      committedPaths: [],
      preservedPaths,
      decision: buildProjectTransactionConflictDecision(transaction, commit.conflicts ?? []),
      commit,
      error: commit.error,
    });
  }
  return baseResult(transaction, {
    ok: commit.ok,
    status: commit.status,
    selectedChoice,
    executionTransactionId: prepared.transaction.id,
    committedPaths: commit.committedPaths,
    preservedPaths,
    commit,
    error: commit.error,
  });
}

function validateDecisionEvidence(
  transaction: PreparedProjectTransaction,
  contract: ProjectTransactionConflictDecision,
  store: DecisionLog,
  decisionEventId: string,
): { selectedChoice?: ProjectTransactionConflictChoice; error?: string } {
  if (contract.transactionId !== transaction.id || contract.kind !== 'project_transaction_conflict') {
    return { error: '冲突契约与事务不匹配' };
  }
  const rows = store.all();
  const event = rows.find((entry) => entry.id === decisionEventId);
  const pending = event?.refId ? rows.find((entry) => entry.id === event.refId) : undefined;
  const choice = event?.selectedChoice as ProjectTransactionConflictChoice | undefined;
  if (!event || !pending || !choice) return { error: '缺少已落盘的冲突裁决事件' };
  if (
    pending.decision !== 'pending' ||
    pending.context?.kind !== contract.kind ||
    pending.context.transactionId !== transaction.id ||
    pending.context.snapshotDir !== contract.snapshotDir ||
    !sameJson(pending.context.conflicts, contract.conflicts) ||
    pending.requiresConfirmation !== true ||
    !pending.choices?.some((item) => item.id === choice) ||
    !contract.options.some((item) => item.id === choice) ||
    pending.defaultChoice !== contract.defaultChoice ||
    !sameJson(
      pending.choices.map(({ id, label, description }) => ({ id, label, description })),
      contract.options,
    ) ||
    event.context?.kind !== contract.kind ||
    event.context.transactionId !== transaction.id ||
    !sameJson(event.context.conflicts, contract.conflicts)
  ) {
    return { error: '冲突裁决证据不完整或事务身份不匹配' };
  }
  const expectedOutcome = choice === 'cancel_all' ? 'reject' : 'approve';
  if (event.decision !== expectedOutcome) return { error: '冲突裁决结果与选择不一致' };
  return { selectedChoice: choice };
}

function collectPreparedBaselineChanges(
  transaction: PreparedProjectTransaction,
  contract: ProjectTransactionConflictDecision,
  prepared: PreparedProjectTransaction,
): ProjectTransactionConflict[] {
  const confirmed = new Map(contract.conflicts.map((conflict) => [pathKey(conflict.path), conflict]));
  const original = new Map(transaction.entries.map((entry) => [pathKey(entry.path), entry]));
  const changed: ProjectTransactionConflict[] = [];
  for (const entry of prepared.entries) {
    const source = original.get(pathKey(entry.path));
    if (!source) continue;
    const prior = confirmed.get(pathKey(entry.path));
    const expectedExists = prior?.existsNow ?? source.existed;
    const expectedSha256 = prior?.currentSha256 ?? source.originalSha256;
    if (entry.existed === expectedExists && entry.originalSha256 === expectedSha256) continue;
    changed.push({
      path: entry.path,
      kind: !expectedExists ? 'created' : !entry.existed ? 'deleted' : 'modified',
      existedAtSnapshot: expectedExists,
      existsNow: entry.existed,
      snapshotSha256: expectedSha256,
      currentSha256: entry.originalSha256,
      proposedSha256: source.proposedSha256,
    });
  }
  return changed;
}

function collectChangesSinceConfirmation(
  transaction: PreparedProjectTransaction,
  contract: ProjectTransactionConflictDecision,
): ProjectTransactionConflict[] {
  const confirmed = new Map(contract.conflicts.map((conflict) => [pathKey(conflict.path), conflict]));
  const changed: ProjectTransactionConflict[] = [];
  for (const entry of transaction.entries) {
    const prior = confirmed.get(pathKey(entry.path));
    const expectedExists = prior?.existsNow ?? entry.existed;
    const expectedSha256 = prior?.currentSha256 ?? entry.originalSha256;
    const existsNow = existsSync(entry.path);
    const currentSha256 = existsNow && statSync(entry.path).isFile()
      ? sha256(readFileSync(entry.path))
      : null;
    if (existsNow === expectedExists && currentSha256 === expectedSha256) continue;
    changed.push({
      path: entry.path,
      kind: !expectedExists ? 'created' : !existsNow ? 'deleted' : 'modified',
      existedAtSnapshot: expectedExists,
      existsNow,
      snapshotSha256: expectedSha256,
      currentSha256,
      proposedSha256: entry.proposedSha256,
    });
  }
  return changed;
}

function baseResult(
  transaction: PreparedProjectTransaction,
  result: Omit<ResolveProjectTransactionConflictResult, 'transactionId'>,
): ResolveProjectTransactionConflictResult {
  return { transactionId: transaction.id, ...result };
}

function pathKey(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
