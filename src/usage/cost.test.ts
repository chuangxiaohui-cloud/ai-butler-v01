import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { writeUsageBudget } from '../config/usage-budget.js';
import { readUsage, recordUsage, type UsageRecord } from './usage-store.js';
import {
  aggregateAiOpsCost,
  assertAiOpsGate,
  assertNotHardStopped,
  buildThresholdAlerts,
  estimateCallCostCny,
  formatAiOpsReport,
} from './cost.js';

// 固定参考时刻：2026-09-01 周二 10:00 北京（高峰）、2026-09-05 周六 10:00 北京（空闲）
const tsPeak = Date.UTC(2026, 8, 1, 2);
const tsOffpeak = Date.UTC(2026, 8, 5, 2);

test('cost: 单次估算按 高峰/空闲 × 缓存命中/未命中（官方价）', () => {
  const peakHit = (model: string) =>
    ({ ts: tsPeak, provider: 'deepseek', model, promptTokens: 1_000_000, completionTokens: 1_000_000, cacheHitTokens: 1_000_000, cacheMissTokens: 0 }) as UsageRecord;
  // flash 高峰：缓存命中输入 0.1 + 输出 9.0 = 9.1
  assert.equal(estimateCallCostCny(peakHit('deepseek-v4-flash')), 9.1);
  // flash 空闲 = 高峰 × 0.5
  assert.equal(estimateCallCostCny({ ...peakHit('deepseek-v4-flash'), ts: tsOffpeak }), 4.55);
  // pro 高峰：命中 0.3 + 输出 27.0
  assert.equal(estimateCallCostCny(peakHit('deepseek-v4-pro')), 27.3);

  // 智谱 glm-5.2：无时段差价（高峰/空闲同价），缓存命中输入 2 / 未命中 8 / 输出 28
  const zhipu = (tokens: number) =>
    ({ ts: tsPeak, provider: 'zhipu', model: 'glm-5.2', promptTokens: tokens, completionTokens: tokens, cacheHitTokens: 0, cacheMissTokens: tokens }) as UsageRecord;
  assert.equal(estimateCallCostCny(zhipu(1_000_000)), 36.0); // 未命中 8 + 输出 28
  assert.equal(
    estimateCallCostCny({
      ...zhipu(1_000_000),
      ts: tsOffpeak,
      cacheHitTokens: 1_000_000,
      cacheMissTokens: 0,
    }),
    30.0, // 命中 2 + 输出 28，空闲不折价
  );

  // MiniMax M2.7 系列：无时段差价（API 按量计费）
  const minimax = (model: string) =>
    ({ ts: tsPeak, provider: 'minimax', model, promptTokens: 1_000_000, completionTokens: 1_000_000, cacheHitTokens: 0, cacheMissTokens: 1_000_000 }) as UsageRecord;
  assert.equal(estimateCallCostCny(minimax('MiniMax-M2.7')), 10.5); // 未命中 2.1 + 输出 8.4
  assert.equal(estimateCallCostCny(minimax('MiniMax-M2.7-highspeed')), 21.0); // 4.2 + 16.8

  // glm-5-turbo：按单次输入整单跳档（owner 示例：31K→低档 0.177 元；33K→高档 0.257 元）
  const turbo = (input: number, output = 0) =>
    ({ ts: tsPeak, provider: 'zhipu', model: 'glm-5-turbo', promptTokens: input, completionTokens: output, cacheHitTokens: 0, cacheMissTokens: input }) as UsageRecord;
  assert.equal(estimateCallCostCny(turbo(31_000, 1_000)), 0.177);
  assert.equal(estimateCallCostCny(turbo(33_000, 1_000)), 0.257);
  assert.equal(estimateCallCostCny(turbo(32_000)), 0.224); // ≥32K 跳高档：32K × 7 / 1e6

  // 未命中：flash 高峰输入 3.0/百万
  const miss = (tokens: number) =>
    ({ ts: tsPeak, provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: tokens, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: tokens }) as UsageRecord;
  assert.equal(estimateCallCostCny(miss(1_000_000)), 3.0);

  // 缺缓存拆分：输入按缓存未命中（上限）
  const noSplit = { ts: tsPeak, provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 1_000_000, completionTokens: 0 } as UsageRecord;
  assert.equal(estimateCallCostCny(noSplit), 3.0);

  // 未登记模型 → null（deepseek-chat 为 v0.1 历史旧名）
  assert.equal(estimateCallCostCny({ ...miss(1_000_000), model: 'deepseek-chat' }), null);
});

test('cost: 按今日/周/月/累计聚合，未计价与缺缓存拆分单列', () => {
  const day = 24 * 60 * 60 * 1000;
  const records: UsageRecord[] = [
    // 2026-09-02 周三 10:00 高峰：flash 未命中 1e6 → 3.0
    { ts: tsPeak + day, provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 1_000_000, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 1_000_000 },
    // 2026-09-01 周二 10:00 高峰：flash 输出 50 万 → 4.5
    { ts: tsPeak, provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 0, completionTokens: 500_000, cacheHitTokens: 0, cacheMissTokens: 0 },
    // 2026-08-31 周一：deepseek-chat 未登记价 → 未计价
    { ts: tsPeak - day, provider: 'deepseek', model: 'deepseek-chat', promptTokens: 100, completionTokens: 100 },
    // 2026-08-01 周六 10:00 空闲：pro 旧记录缺拆分，未命中 1e6 × 9.0 × 0.5 = 4.5（仅累计）
    { ts: Date.UTC(2026, 7, 1, 2), provider: 'deepseek', model: 'deepseek-v4-pro', promptTokens: 1_000_000, completionTokens: 0 },
  ];
  const agg = aggregateAiOpsCost(records, tsPeak + day);
  assert.equal(agg.todayCny, 3.0);
  assert.equal(agg.weekCny, 7.5);
  assert.equal(agg.monthCny, 7.5);
  assert.equal(agg.totalCny, 12.0);
  assert.equal(agg.pricedCalls, 3);
  assert.equal(agg.unpricedCalls, 1);
  assert.equal(agg.pricedWithoutCacheSplit, 1);
  assert.deepEqual(agg.byModel['deepseek-v4-flash'], { calls: 2, costCny: 7.5 });
  assert.deepEqual(agg.byModel['deepseek-v4-pro'], { calls: 1, costCny: 4.5 });
});

test('cost: 阈值告警 50/80/100%（§COST C-4），未配置预算为空', () => {
  const flashMiss1e6: UsageRecord[] = [
    { ts: tsPeak, provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 1_000_000, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 1_000_000 },
  ];
  const base = { budgetYuan: null, degradeAtPercent: 90, dailyBudgetCny: null, monthlyBudgetCny: null, hardStop: false };
  assert.deepEqual(buildThresholdAlerts(flashMiss1e6, base, tsPeak), []);

  const yellow = { ...base, dailyBudgetCny: 5 };
  assert.ok(buildThresholdAlerts(flashMiss1e6, yellow, tsPeak)[0].startsWith('⚠️'));
  const red = { ...base, dailyBudgetCny: 3.75 };
  assert.ok(buildThresholdAlerts(flashMiss1e6, red, tsPeak)[0].startsWith('🔴'));
  const stopped = { ...base, dailyBudgetCny: 3 };
  assert.ok(buildThresholdAlerts(flashMiss1e6, stopped, tsPeak)[0].startsWith('🚫'));
});

test('cost: 硬停门禁——hardStop 且日预算耗尽时抛错，其余情况无副作用', () => {
  const records: UsageRecord[] = [
    { ts: Date.now(), provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 2_000_000, completionTokens: 0 },
  ];
  const budget = { budgetYuan: null, degradeAtPercent: 90, dailyBudgetCny: 0.1, monthlyBudgetCny: null, hardStop: true };
  assert.doesNotThrow(() => assertNotHardStopped(records, { ...budget, hardStop: false }, Date.now()));
  assert.throws(
    () => assertNotHardStopped(records, budget, Date.now()),
    (err: unknown) => err instanceof Error && err.message.startsWith('🚫'),
  );
});

test('cost: assertAiOpsGate 读注入文件——超预算硬停抛错，hardStop=false 放行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cost-gate-'));
  const usageFile = join(dir, 'usage.jsonl');
  const budgetFile = join(dir, 'usage-budget.json');
  try {
    recordUsage(
      { ts: Date.now(), provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 2_000_000, completionTokens: 0 },
      usageFile,
    );
    writeUsageBudget(
      { budgetYuan: null, degradeAtPercent: 90, dailyBudgetCny: 0.1, monthlyBudgetCny: null, hardStop: true },
      budgetFile,
    );
    assert.throws(() => assertAiOpsGate(usageFile, budgetFile), /AI_OPS_BUDGET_EXCEEDED|🚫/);
    writeUsageBudget(
      { budgetYuan: null, degradeAtPercent: 90, dailyBudgetCny: 0.1, monthlyBudgetCny: null, hardStop: false },
      budgetFile,
    );
    assert.doesNotThrow(() => assertAiOpsGate(usageFile, budgetFile));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cost: 老板问答报告包含今日/本月/调用数/未计价/缺拆分标注', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cost-report-'));
  const usageFile = join(dir, 'usage.jsonl');
  const budgetFile = join(dir, 'usage-budget.json');
  try {
    recordUsage(
      { ts: tsPeak, provider: 'deepseek', model: 'deepseek-v4-flash', promptTokens: 1_000_000, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 1_000_000 },
      usageFile,
    );
    recordUsage(
      { ts: tsPeak, provider: 'deepseek', model: 'deepseek-chat', promptTokens: 100, completionTokens: 100 },
      usageFile,
    );
    writeUsageBudget(
      { budgetYuan: null, degradeAtPercent: 90, dailyBudgetCny: 5, monthlyBudgetCny: 150, hardStop: false },
      budgetFile,
    );
    const report = formatAiOpsReport(readUsage(usageFile), { now: tsPeak, budgetFile });
    assert.ok(report.includes('今日: ¥3.00 / 预算 ¥5'));
    assert.ok(report.includes('本月: ¥3.00 / 预算 ¥150'));
    assert.ok(report.includes('未计价 1'));
    assert.ok(report.includes('deepseek-v4-flash: ¥3.00'));
    assert.ok(!report.includes('缺缓存拆分')); // 新记录带拆分，不出现注记
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
