/**
 * 路由 case 审计（Phase 2）
 * 统计收集进度、反馈样本、来源/决策分布，并检查记录质量。
 */

import type { RouteCaseRecord } from './route-case-store.js';

export interface RouteCaseAudit {
  total: number;
  withFeedback: number;
  bySource: Record<string, number>;
  byDecision: Record<string, number>;
  byFeedback: Record<string, number>;
  calibrationProgress: {
    accepted: number;
    rejected: number;
    target: number;
    ready: boolean;
  };
  issues: string[];
}

export const CALIBRATION_TARGET = 10;

export function auditRouteCases(records: RouteCaseRecord[]): RouteCaseAudit {
  const bySource: Record<string, number> = {};
  const byDecision: Record<string, number> = {};
  const byFeedback: Record<string, number> = {};
  const ids = new Set<string>();
  const issues: string[] = [];

  for (const record of records) {
    bySource[record.source ?? 'unknown'] = (bySource[record.source ?? 'unknown'] ?? 0) + 1;
    byDecision[record.result.decision.type] =
      (byDecision[record.result.decision.type] ?? 0) + 1;
    if (record.feedback) {
      byFeedback[record.feedback] = (byFeedback[record.feedback] ?? 0) + 1;
    }

    if (ids.has(record.id)) issues.push(`重复 id：${record.id}`);
    ids.add(record.id);
    if (!record.result.features || !Array.isArray(record.result.candidates)) {
      issues.push(`记录 ${record.id} 缺少 features/candidates 结构`);
    }
    if (
      (record.feedback === 'reject' || record.feedback === 'correct') &&
      !record.correctedRoute
    ) {
      issues.push(`记录 ${record.id} 标记 ${record.feedback} 但缺少 correctedRoute`);
    }
    if (record.correctedRoute && !record.feedback) {
      issues.push(`记录 ${record.id} 有 correctedRoute 但缺少 feedback`);
    }
  }

  const accepted = byFeedback.accept ?? 0;
  const rejected = byFeedback.reject ?? 0;
  return {
    total: records.length,
    withFeedback: records.filter((r) => r.feedback).length,
    bySource,
    byDecision,
    byFeedback,
    calibrationProgress: {
      accepted,
      rejected,
      target: CALIBRATION_TARGET,
      ready: accepted + rejected >= CALIBRATION_TARGET,
    },
    issues,
  };
}
