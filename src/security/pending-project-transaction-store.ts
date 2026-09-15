import type { DecisionLog } from '../escalation/decision-log.js';
import { queueProjectTransactionConflictDecision } from './project-conflict-confirmation.js';
import {
  resolveProjectTransactionConflict,
  type ResolveProjectTransactionConflictResult,
} from './project-conflict-resolution.js';
import {
  cancelPreparedProjectTransaction,
  commitProjectTransaction,
  type CommitProjectTransactionResult,
  type PreparedProjectTransaction,
  type ProjectTransactionConflictDecision,
} from './project-transaction.js';

export interface PendingProjectTransaction {
  pendingDecisionId: string;
  transaction: PreparedProjectTransaction;
  conflictDecision?: ProjectTransactionConflictDecision;
  conversationId?: string;
  createdAt: number;
}

export interface PendingProjectTransactionResolution {
  ok: boolean;
  status:
    | 'completed'
    | 'cancelled'
    | 'conflict_pending'
    | 'expired'
    | 'invalid_decision'
    | 'cleanup_failed'
    | 'prepare_failed'
    | 'stage_failed'
    | 'rolled_back'
    | 'rollback_failed';
  transactionId?: string;
  pendingDecisionId?: string;
  conflictDecisionId?: string;
  commit?: CommitProjectTransactionResult;
  conflictResolution?: ResolveProjectTransactionConflictResult;
  error?: string;
}

export class PendingProjectTransactionStore {
  private readonly entries = new Map<string, PendingProjectTransaction>();

  register(
    pendingDecisionId: string,
    transaction: PreparedProjectTransaction,
    opts: { conversationId?: string; createdAt?: number } = {},
  ): PendingProjectTransaction {
    if (!pendingDecisionId || this.entries.has(pendingDecisionId)) {
      throw new Error('待处理事务 decision id 为空或重复');
    }
    const entry = {
      pendingDecisionId,
      transaction,
      conversationId: opts.conversationId,
      createdAt: opts.createdAt ?? Date.now(),
    };
    this.entries.set(pendingDecisionId, entry);
    return entry;
  }

  get(pendingDecisionId: string): PendingProjectTransaction | null {
    return this.entries.get(pendingDecisionId) ?? null;
  }

  size(): number {
    return this.entries.size;
  }

  discard(pendingDecisionId: string): boolean {
    const stored = this.entries.get(pendingDecisionId);
    if (!stored) return false;
    const cancelled = cancelPreparedProjectTransaction(stored.transaction);
    if (cancelled.ok) this.entries.delete(pendingDecisionId);
    return cancelled.ok;
  }

  resolveInitialDecision(
    decisionLog: DecisionLog,
    decisionEventId: string,
  ): PendingProjectTransactionResolution {
    const rows = decisionLog.all();
    const event = rows.find((row) => row.id === decisionEventId);
    const pending = event?.refId ? rows.find((row) => row.id === event.refId) : undefined;
    if (
      !event ||
      !pending ||
      pending.decision !== 'pending' ||
      pending.context?.kind !== 'project_multifile_change_confirmation' ||
      event.context?.kind !== pending.context.kind ||
      (event.selectedChoice !== 'confirm_changes' && event.selectedChoice !== 'cancel_all')
    ) {
      return { ok: false, status: 'invalid_decision', error: '多文件事务裁决证据无效' };
    }
    const stored = this.entries.get(pending.id);
    if (!stored) {
      return {
        ok: false,
        status: 'expired',
        pendingDecisionId: pending.id,
        error: '待处理事务仅保存在原进程内，当前已失效；请重新提交多文件变更清单',
      };
    }
    if (
      pending.context.transactionId !== stored.transaction.id ||
      event.context?.transactionId !== stored.transaction.id
    ) {
      return {
        ok: false,
        status: 'invalid_decision',
        transactionId: stored.transaction.id,
        pendingDecisionId: pending.id,
        error: '裁决记录与待处理事务身份不匹配',
      };
    }
    if (event.selectedChoice === 'cancel_all') {
      const cancelled = cancelPreparedProjectTransaction(stored.transaction);
      if (cancelled.ok) this.entries.delete(pending.id);
      return {
        ok: cancelled.ok,
        status: cancelled.status,
        transactionId: stored.transaction.id,
        pendingDecisionId: pending.id,
        error: cancelled.error,
      };
    }

    const commit = commitProjectTransaction(stored.transaction);
    if (commit.status === 'conflict') {
      if (!commit.decision) {
        return {
          ok: false,
          status: 'invalid_decision',
          transactionId: stored.transaction.id,
          pendingDecisionId: pending.id,
          commit,
          error: '冲突结果缺少仲裁契约',
        };
      }
      const conflictPending = queueProjectTransactionConflictDecision(
        decisionLog,
        commit.decision,
        { conversationId: stored.conversationId },
      );
      this.entries.delete(pending.id);
      this.entries.set(conflictPending.id, {
        ...stored,
        pendingDecisionId: conflictPending.id,
        conflictDecision: commit.decision,
      });
      return {
        ok: false,
        status: 'conflict_pending',
        transactionId: stored.transaction.id,
        pendingDecisionId: pending.id,
        conflictDecisionId: conflictPending.id,
        commit,
        error: commit.error,
      };
    }
    this.entries.delete(pending.id);
    return {
      ok: commit.ok,
      status: commit.status,
      transactionId: stored.transaction.id,
      pendingDecisionId: pending.id,
      commit,
      error: commit.error,
    };
  }

  resolveConflictDecision(
    decisionLog: DecisionLog,
    decisionEventId: string,
  ): PendingProjectTransactionResolution {
    const rows = decisionLog.all();
    const event = rows.find((row) => row.id === decisionEventId);
    const pending = event?.refId ? rows.find((row) => row.id === event.refId) : undefined;
    if (
      !event ||
      !pending ||
      pending.decision !== 'pending' ||
      pending.context?.kind !== 'project_transaction_conflict' ||
      event.context?.kind !== pending.context.kind
    ) {
      return { ok: false, status: 'invalid_decision', error: '项目冲突裁决证据无效' };
    }
    const stored = this.entries.get(pending.id);
    if (!stored) {
      return {
        ok: false,
        status: 'expired',
        pendingDecisionId: pending.id,
        error: '待处理事务仅保存在原进程内，当前已失效；请重新提交多文件变更清单',
      };
    }
    if (!stored.conflictDecision) {
      return {
        ok: false,
        status: 'invalid_decision',
        transactionId: stored.transaction.id,
        pendingDecisionId: pending.id,
        error: '待处理事务缺少冲突契约',
      };
    }

    const resolution = resolveProjectTransactionConflict(
      stored.transaction,
      stored.conflictDecision,
      decisionLog,
      decisionEventId,
    );
    if (resolution.status === 'invalid_decision') {
      return {
        ok: false,
        status: resolution.status,
        transactionId: stored.transaction.id,
        pendingDecisionId: pending.id,
        conflictResolution: resolution,
        error: resolution.error,
      };
    }
    if (resolution.status === 'reconfirmation_required') {
      if (!resolution.decision) {
        return {
          ok: false,
          status: 'invalid_decision',
          transactionId: stored.transaction.id,
          pendingDecisionId: pending.id,
          conflictResolution: resolution,
          error: '重新确认结果缺少冲突契约',
        };
      }
      const nextPending = queueProjectTransactionConflictDecision(
        decisionLog,
        resolution.decision,
        { conversationId: stored.conversationId },
      );
      this.entries.delete(pending.id);
      this.entries.set(nextPending.id, {
        ...stored,
        pendingDecisionId: nextPending.id,
        conflictDecision: resolution.decision,
      });
      return {
        ok: false,
        status: 'conflict_pending',
        transactionId: stored.transaction.id,
        pendingDecisionId: pending.id,
        conflictDecisionId: nextPending.id,
        conflictResolution: resolution,
        error: resolution.error,
      };
    }

    if (resolution.status === 'cancelled') {
      const cancelled = cancelPreparedProjectTransaction(stored.transaction);
      if (cancelled.ok) this.entries.delete(pending.id);
      return {
        ok: cancelled.ok,
        status: cancelled.status,
        transactionId: stored.transaction.id,
        pendingDecisionId: pending.id,
        conflictResolution: resolution,
        error: cancelled.error,
      };
    }
    this.entries.delete(pending.id);
    return {
      ok: resolution.ok,
      status: resolution.status,
      transactionId: stored.transaction.id,
      pendingDecisionId: pending.id,
      commit: resolution.commit,
      conflictResolution: resolution,
      error: resolution.error,
    };
  }
}

let sharedStore: PendingProjectTransactionStore | null = null;

export function defaultPendingProjectTransactionStore(): PendingProjectTransactionStore {
  sharedStore ??= new PendingProjectTransactionStore();
  return sharedStore;
}
