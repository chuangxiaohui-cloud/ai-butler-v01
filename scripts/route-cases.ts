/**
 * 路由 case 看板：统计收集进度、反馈样本与质量问题。
 * 用法：npm run route:cases
 */

import { RouteCaseStore } from '../src/agent/route-case-store.js';
import { auditRouteCases } from '../src/agent/route-case-audit.js';

const store = new RouteCaseStore();
const records = store.list();
const audit = auditRouteCases(records);

console.log(
  JSON.stringify(
    {
      total: audit.total,
      withFeedback: audit.withFeedback,
      bySource: audit.bySource,
      byDecision: audit.byDecision,
      byFeedback: audit.byFeedback,
      calibrationProgress: audit.calibrationProgress,
      issues: audit.issues,
      recent: records.slice(-5).map((r) => ({
        id: r.id,
        query: r.query,
        source: r.source ?? 'unknown',
        decision: r.result.decision.type,
        confidence: Number(r.result.confidence.toFixed(2)),
        feedback: r.feedback ?? null,
      })),
    },
    null,
    2,
  ),
);
