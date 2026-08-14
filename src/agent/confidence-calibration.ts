/**
 * 置信度校准建议（Phase 3）
 * 基于已反馈 case 给出阈值建议，人工确认后写回 PARAM。
 */

import { PARAMS } from '../config/params.js';

export interface CalibrationRecord {
  result: { confidence: number };
  feedback?: 'accept' | 'reject' | 'correct';
}

export interface CalibrationSuggestion {
  suggestedLow: number;
  suggestedHigh: number;
  rejectedCount: number;
  acceptedCount: number;
  note: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[index];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calibrateThresholds(
  records: CalibrationRecord[],
  current = PARAMS,
): CalibrationSuggestion {
  const rejected = records
    .filter((r) => r.feedback === 'reject')
    .map((r) => r.result.confidence)
    .sort((a, b) => a - b);
  const accepted = records
    .filter((r) => r.feedback === 'accept')
    .map((r) => r.result.confidence)
    .sort((a, b) => a - b);

  let suggestedLow: number = current.routeConfidenceLow;
  let suggestedHigh: number = current.routeConfidenceHigh;
  const notes: string[] = [];

  if (rejected.length >= 3) {
    const rejectedP75 = percentile(rejected, 0.75);
    suggestedLow = clamp(Math.max(suggestedLow, rejectedP75), 0.3, 0.65);
    notes.push(`rejected=${rejected.length}`);
  }
  if (accepted.length >= 3) {
    const acceptedP25 = percentile(accepted, 0.25);
    suggestedHigh = clamp(
      Math.max(suggestedHigh, acceptedP25 + current.routeCandidateGap),
      0.7,
      0.95,
    );
    notes.push(`accepted=${accepted.length}`);
  }

  return {
    suggestedLow,
    suggestedHigh,
    rejectedCount: rejected.length,
    acceptedCount: accepted.length,
    note: notes.length > 0 ? notes.join('；') : '样本不足，保持现值',
  };
}
