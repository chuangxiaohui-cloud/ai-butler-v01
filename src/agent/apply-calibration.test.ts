import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { applyCalibration, MIN_CALIBRATION_SAMPLES } from './apply-calibration.js';

function feedbackRecord(id: string, confidence: number, feedback: 'accept' | 'reject') {
  return {
    id,
    timestamp: 1,
    query: `q-${id}`,
    result: { confidence },
    feedback,
  };
}

test('apply-calibration: 样本不足时拒绝回写', () => {
  const result = applyCalibration([feedbackRecord('a', 0.7, 'accept')]);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes(`${1}/${MIN_CALIBRATION_SAMPLES}`));
});

test('apply-calibration: 样本达标时给出可回写阈值', () => {
  const records = Array.from({ length: MIN_CALIBRATION_SAMPLES }, (_, i) =>
    feedbackRecord(`r${i}`, 0.5 + (i % 3) * 0.05, i % 2 === 0 ? 'accept' : 'reject'),
  );
  const result = applyCalibration(records);
  assert.equal(result.ok, true);
  assert.ok(result.values);
  assert.ok(result.values!.routeConfidenceLow >= 0.3 && result.values!.routeConfidenceLow <= 0.65);
  assert.ok(result.values!.routeConfidenceHigh >= 0.7 && result.values!.routeConfidenceHigh <= 0.95);
});
