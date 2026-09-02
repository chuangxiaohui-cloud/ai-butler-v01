import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isPeakHourBeijing, modelPriceCny, OFFPEAK_FACTOR } from './model-pricing.js';

test('model-pricing: 三种 DeepSeek 模型已登记官方高峰价，未知返回 null', () => {
  assert.deepEqual(modelPriceCny('deepseek-v4-flash'), {
    inputCacheHitPerMTok: 0.1,
    inputCacheMissPerMTok: 3.0,
    outputPerMTok: 9.0,
    offpeakFactor: 0.5,
  });
  assert.deepEqual(modelPriceCny('deepseek-v4-pro'), {
    inputCacheHitPerMTok: 0.3,
    inputCacheMissPerMTok: 9.0,
    outputPerMTok: 27.0,
    offpeakFactor: 0.5,
  });
  assert.deepEqual(modelPriceCny('deepseek-v4-flash-vision-exp'), {
    inputCacheHitPerMTok: 0.1,
    inputCacheMissPerMTok: 3.0,
    outputPerMTok: 9.0,
    offpeakFactor: 0.5,
  });
  assert.deepEqual(modelPriceCny('glm-5.2'), {
    inputCacheHitPerMTok: 2.0,
    inputCacheMissPerMTok: 8.0,
    outputPerMTok: 28.0,
    offpeakFactor: 1,
  });
  assert.deepEqual(modelPriceCny('glm-5.3'), {
    inputCacheHitPerMTok: 2.0,
    inputCacheMissPerMTok: 8.0,
    outputPerMTok: 28.0,
    offpeakFactor: 1,
  });
  assert.deepEqual(modelPriceCny('MiniMax-M2.7'), {
    inputCacheHitPerMTok: 0.42,
    inputCacheMissPerMTok: 2.1,
    outputPerMTok: 8.4,
    offpeakFactor: 1,
  });
  assert.deepEqual(modelPriceCny('MiniMax-M2.7-highspeed'), {
    inputCacheHitPerMTok: 0.42,
    inputCacheMissPerMTok: 4.2,
    outputPerMTok: 16.8,
    offpeakFactor: 1,
  });
  assert.deepEqual(modelPriceCny('MiniMax-M3'), {
    inputCacheHitPerMTok: 0.42,
    inputCacheMissPerMTok: 2.1,
    outputPerMTok: 8.4,
    offpeakFactor: 1,
  });
  assert.deepEqual(modelPriceCny('glm-5-turbo'), {
    inputCacheHitPerMTok: 1.2,
    inputCacheMissPerMTok: 5.0,
    outputPerMTok: 22.0,
    offpeakFactor: 1,
    byInputTiers: [
      { minInputTokens: 32_000, inputCacheHitPerMTok: 1.8, inputCacheMissPerMTok: 7.0, outputPerMTok: 26.0 },
    ],
  });
  assert.equal(OFFPEAK_FACTOR, 0.5);
});

test('model-pricing: 高峰判定（北京时间周一至周五 9-12、14-18，其余空闲）', () => {
  // 2026-09-01 周二 10:00 北京 → 高峰
  assert.equal(isPeakHourBeijing(Date.UTC(2026, 8, 1, 2)), true);
  // 2026-09-05 周六 10:00 北京 → 周末空闲
  assert.equal(isPeakHourBeijing(Date.UTC(2026, 8, 5, 2)), false);
  // 2026-09-08 周二 13:00 北京 → 工作日午休空闲
  assert.equal(isPeakHourBeijing(Date.UTC(2026, 8, 8, 5)), false);
  // 2026-09-08 周二 15:00 北京 → 高峰
  assert.equal(isPeakHourBeijing(Date.UTC(2026, 8, 8, 7)), true);
  // 2026-10-01 周四 23:00 北京 → 深夜空闲
  assert.equal(isPeakHourBeijing(Date.UTC(2026, 9, 1, 15)), false);
});
