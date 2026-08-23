import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { calibrateThresholds, type CalibrationRecord } from './confidence-calibration.js';
import { PARAMS } from '../config/params.js';

const DAY = 86_400_000;

function record(
  confidence: number,
  feedback: 'accept' | 'reject',
  ts = Date.now(),
): CalibrationRecord {
  return { timestamp: ts, result: { confidence }, feedback };
}

test('calibration: 小样本 75 分位不再取最大值（B2）', () => {
  const records = [
    record(0.2, 'reject'),
    record(0.4, 'reject'),
    record(0.6, 'reject'),
    record(0.9, 'reject'),
  ];
  const suggestion = calibrateThresholds(records);
  // 旧实现 floor(0.75*4)=3 取 0.9 → clamp 0.65；nearest-rank 应取 0.6
  assert.equal(suggestion.suggestedLow, 0.6);
  assert.equal(suggestion.rejectedCount, 4);
});

test('calibration: 阈值可双向收敛，不再只升不降（B2）', () => {
  const records = [
    record(0.2, 'reject'),
    record(0.3, 'reject'),
    record(0.4, 'reject'),
  ];
  const suggestion = calibrateThresholds(records, {
    routeConfidenceLow: 0.6,
    routeConfidenceHigh: 0.75,
    routeCandidateGap: 0.15,
  });
  // P75 = 0.4 < 现值 0.6：去掉 Math.max 棘轮后应建议下调
  assert.equal(suggestion.suggestedLow, 0.4);
});

test('calibration: 窗口外早期误标不参与建议（B2 时间窗）', () => {
  const now = Date.now();
  const records = [
    record(0.9, 'reject', now - 40 * DAY),
    record(0.3, 'reject'),
    record(0.35, 'reject'),
  ];
  const suggestion = calibrateThresholds(records, PARAMS, 30 * DAY);
  // 窗口内 reject 只有 2 条，不足 3 → 保持现值，0.9 误标被时间窗排除
  assert.equal(suggestion.suggestedLow, PARAMS.routeConfidenceLow);
  assert.equal(suggestion.rejectedCount, 2);
});

test('calibration: accept 25 分位 + gap 建议 high（B2 分位修正）', () => {
  const records = [
    record(0.6, 'accept'),
    record(0.7, 'accept'),
    record(0.8, 'accept'),
    record(0.95, 'accept'),
  ];
  const suggestion = calibrateThresholds(records);
  // 旧实现 floor(0.25*4)=1 → 0.7+gap=0.85；nearest-rank 取 0.6+gap=0.75
  assert.equal(suggestion.suggestedHigh, 0.75);
  assert.equal(suggestion.acceptedCount, 4);
});

test('calibration: 样本不足保持现值', () => {
  const records = [record(0.8, 'reject'), record(0.9, 'accept')];
  const suggestion = calibrateThresholds(records);
  assert.equal(suggestion.suggestedLow, PARAMS.routeConfidenceLow);
  assert.equal(suggestion.suggestedHigh, PARAMS.routeConfidenceHigh);
});
