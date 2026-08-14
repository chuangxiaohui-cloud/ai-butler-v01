/**
 * 阈值应用（Phase 3）
 * 样本足够时给出可写回 PARAM 的阈值；样本不足时拒绝，避免小样本抖动。
 */

import {
  calibrateThresholds,
  type CalibrationRecord,
  type CalibrationSuggestion,
} from './confidence-calibration.js';
export const MIN_CALIBRATION_SAMPLES = 10;

export interface AppliedCalibration {
  ok: boolean;
  reason: string;
  values?: { routeConfidenceLow: number; routeConfidenceHigh: number };
  suggestion: CalibrationSuggestion;
}

export function applyCalibration(
  records: CalibrationRecord[],
  minSamples = MIN_CALIBRATION_SAMPLES,
): AppliedCalibration {
  const suggestion = calibrateThresholds(records);
  const samples = suggestion.rejectedCount + suggestion.acceptedCount;
  if (samples < minSamples) {
    return {
      ok: false,
      reason: `样本不足：${samples}/${minSamples}，阈值不回写`,
      suggestion,
    };
  }
  return {
    ok: true,
    reason: `样本达标：${samples}/${minSamples}`,
    values: {
      routeConfidenceLow: Math.round(suggestion.suggestedLow * 100) / 100,
      routeConfidenceHigh: Math.round(suggestion.suggestedHigh * 100) / 100,
    },
    suggestion,
  };
}
