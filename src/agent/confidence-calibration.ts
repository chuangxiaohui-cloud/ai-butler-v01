/**
 * 置信度校准建议（Phase 3）
 * 基于已反馈 case 给出阈值建议，人工确认后写回 PARAM。
 */

import { PARAMS } from '../config/params.js';

export interface CalibrationRecord {
  /** 样本时间戳（B2 时间窗依据；缺省视为窗口内，兼容旧数据） */
  timestamp?: number;
  result: {
    confidence: number;
    decision?: { type: string };
  };
  feedback?: 'accept' | 'reject' | 'correct';
  correctedRoute?: { primaryLens?: string; intent?: string };
}

export interface CalibrationSuggestion {
  suggestedLow: number;
  suggestedHigh: number;
  rejectedCount: number;
  acceptedCount: number;
  note: string;
}

/** calibrateThresholds 只依赖这三个阈值参数 */
export interface CalibrationParams {
  routeConfidenceLow: number;
  routeConfidenceHigh: number;
  routeCandidateGap: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  // B2（架构审计 2026-08-23）：nearest-rank 分位——ceil(p*n)-1，
  // 小样本（n=4, p=0.75）取 75 分位而非最大值，建议阈值不再方向性偏激。
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isClarifyDecision(record: CalibrationRecord): boolean {
  const type = record.result.decision?.type;
  return type === 'must_clarify' || type === 'option_clarify';
}

export function calibrateThresholds(
  records: CalibrationRecord[],
  current: CalibrationParams = PARAMS,
  windowMs = PARAMS.calibrationWindowDays * 86_400_000,
): CalibrationSuggestion {
  // B2：只取 [P-119] 时间窗内样本——早期误标不再把阈值永久钉死在 clamp 上限，
  // 回路可双向收敛；无时间戳旧样本视为窗口内，兼容导入类调用方。
  const cutoff = Date.now() - windowMs;
  const recent = records.filter(
    (r) => r.timestamp === undefined || r.timestamp >= cutoff,
  );
  const rejected = recent
    .filter((r) => r.feedback === 'reject')
    .map((r) => r.result.confidence)
    .sort((a, b) => a - b);
  const accepted = recent
    .filter((r) => r.feedback === 'accept')
    .map((r) => r.result.confidence)
    .sort((a, b) => a - b);

  let suggestedLow: number = current.routeConfidenceLow;
  let suggestedHigh: number = current.routeConfidenceHigh;
  const notes: string[] = [];

  if (rejected.length >= 3) {
    // 只有“该澄清却直答/确认”或缺少修正路由的 reject 才应抬高澄清阈值；
    // “该直答却澄清”的 reject（must_clarify/option_clarify + correctedRoute）不参与抬高。
    const rejectedClarify = recent
      .filter(
        (r) =>
          r.feedback === 'reject' &&
          !(isClarifyDecision(r) && r.correctedRoute),
      )
      .map((r) => r.result.confidence)
      .sort((a, b) => a - b);
    const rejectedP75 = percentile(rejectedClarify, 0.75);
    // B2：去掉 Math.max 棘轮——按样本分位双向建议，clamp 限定安全范围，回路可收敛。
    suggestedLow = clamp(rejectedP75, 0.3, 0.65);
    notes.push(`rejected=${rejected.length} clarify=${rejectedClarify.length}`);
  }
  if (accepted.length >= 3) {
    const acceptedP25 = percentile(accepted, 0.25);
    suggestedHigh = clamp(acceptedP25 + current.routeCandidateGap, 0.7, 0.95);
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
