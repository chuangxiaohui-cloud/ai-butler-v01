import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeMaturityMetrics, countReuseEvents, type MaturityInputs } from './metrics.js';

function baseInput(overrides: Partial<MaturityInputs> = {}): MaturityInputs {
  return {
    presetSkills: ['engineer', 'chip-analysis', 'content-writer'],
    skillStats: [
      { name: 'engineer', usageCount: 10, thumbsDownCount: 0 },
      { name: 'chip-analysis', usageCount: 5, thumbsDownCount: 1 },
      { name: 'unused-preset', usageCount: 0, thumbsDownCount: 0 },
    ],
    installedMarketSkills: [],
    feedbackSamples: [],
    reuse: { skillEvents: 0, answerEvents: 0 },
    ...overrides,
  };
}

test('computeMaturityMetrics：当前基线输出 L1 + 缺口清单', () => {
  const metrics = computeMaturityMetrics(baseInput());
  assert.equal(metrics.level, 'L1');
  assert.equal(metrics.skillCoverage.presetTotal, 3);
  assert.equal(metrics.skillCoverage.presetUsed, 2);
  assert.equal(metrics.skillCoverage.userAccumulated, 0);
  assert.ok(metrics.gaps.some((g) => g.includes('50+')));
  assert.ok(metrics.gaps.some((g) => g.includes('无样本')));
  assert.ok(metrics.gaps.some((g) => g.includes('未观测')));
});

test('computeMaturityMetrics：通过率 = accept/(accept+reject+correct)', () => {
  const metrics = computeMaturityMetrics(
    baseInput({
      feedbackSamples: [
        { source: 'pipeline', feedback: 'accept' },
        { source: 'pipeline', feedback: 'accept' },
        { source: 'pipeline', feedback: 'reject' },
        { source: 'pipeline', feedback: 'correct' },
      ],
    }),
  );
  assert.equal(metrics.acceptance.accept, 2);
  assert.equal(metrics.acceptance.correct, 1);
  assert.equal(metrics.acceptance.total, 4);
  assert.equal(metrics.acceptance.rate, 0.5);
});

test('computeMaturityMetrics：n<30 且通过率达标时提示样本不足', () => {
  const feedbackSamples = Array.from({ length: 10 }, () => ({ source: 'pipeline', feedback: 'accept' }));
  const metrics = computeMaturityMetrics(baseInput({ feedbackSamples }));
  assert.equal(metrics.acceptance.rate, 1);
  assert.ok(metrics.gaps.some((g) => g.includes('n=10<30')));
});

test('computeMaturityMetrics：三判据齐达标 → L2；达标 + 更高阈值 → L3', () => {
  const l2 = computeMaturityMetrics(
    baseInput({
      installedMarketSkills: Array.from({ length: 50 }, (_, i) => `skill-${i}`),
      feedbackSamples: Array.from({ length: 30 }, () => ({ source: 'pipeline', feedback: 'accept' })),
      reuse: { skillEvents: 60, answerEvents: 100 },
    }),
  );
  assert.equal(l2.level, 'L2');
  assert.equal(l2.gaps.length, 0);

  const l3 = computeMaturityMetrics(
    baseInput({
      installedMarketSkills: Array.from({ length: 60 }, (_, i) => `skill-${i}`),
      feedbackSamples: Array.from({ length: 40 }, () => ({ source: 'pipeline', feedback: 'accept' })),
      reuse: { skillEvents: 80, answerEvents: 100 },
    }),
  );
  assert.equal(l3.level, 'L3');
});

test('computeMaturityMetrics：证据链抽样输入时输出 rate，未抽样为 null', () => {
  const withSample = computeMaturityMetrics(baseInput({ evidenceSample: { total: 10, withEvidence: 7 } }));
  assert.equal(withSample.evidenceChain?.rate, 0.7);

  const without = computeMaturityMetrics(baseInput());
  assert.equal(without.evidenceChain, null);
});

test('countReuseEvents：只计 direct/market_trigger 派发与 answer，injected 不计入', () => {
  const obs = countReuseEvents([
    { type: 'skill', skill: { kind: 'direct' } },
    { type: 'skill', skill: { kind: 'market_trigger' } },
    { type: 'skill', skill: { kind: 'injected' } },
    { type: 'skill', skill: { kind: 'unknown' } },
    { type: 'skill', skill: undefined },
    { type: 'answer' },
    { type: 'route' },
    { type: 'search' },
  ]);
  assert.equal(obs.skillEvents, 2);
  assert.equal(obs.answerEvents, 1);
});

test('countReuseEvents：空输入返回零', () => {
  const obs = countReuseEvents([]);
  assert.deepEqual(obs, { skillEvents: 0, answerEvents: 0 });
});

test('computeMaturityMetrics：无预置 Skill 时判定 L0', () => {
  const metrics = computeMaturityMetrics(baseInput({ presetSkills: [] }));
  assert.equal(metrics.level, 'L0');
});