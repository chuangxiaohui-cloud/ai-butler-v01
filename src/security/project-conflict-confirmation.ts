import { DecisionLog, type DecisionLogEntry } from '../escalation/decision-log.js';
import type { ProjectTransactionConflictDecision } from './project-transaction.js';

export function queueProjectTransactionConflictDecision(
  store: DecisionLog,
  contract: ProjectTransactionConflictDecision,
  opts: { conversationId?: string } = {},
): DecisionLogEntry {
  const choices = contract.options.map((option) => ({
    ...option,
    outcome: option.id === 'cancel_all' ? 'reject' as const : 'approve' as const,
  }));
  return store.record({
    trigger: 'human_arbitration',
    question: `项目事务检测到 ${contract.conflicts.length} 个文件冲突，请选择处理方式。`,
    options: choices.map((choice) => choice.label),
    choices,
    defaultChoice: contract.defaultChoice,
    requiresConfirmation: contract.requiresConfirmation,
    context: {
      kind: contract.kind,
      transactionId: contract.transactionId,
      snapshotDir: contract.snapshotDir,
      conflicts: contract.conflicts,
    },
    decision: 'pending',
    conversationId: opts.conversationId,
  });
}
