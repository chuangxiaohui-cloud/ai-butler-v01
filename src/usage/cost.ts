/**
 * AI 运营成本层（§COST v1 最小闭环，2026-09-02）
 * 以 E113 usage 记账（data/usage.jsonl）为基础估算人民币费用：
 * - 单价表只覆盖 owner 已确认模型，未知模型诚实不计价（unpriced）；
 * - 预算来自 usage-budget.json（缺省启用日/月预算默认 [P-143]/[P-144]，hardStop 关 = 只告警不硬停）；
 * - 阈值分级对齐 §COST C-4（黄 [P-145] / 红 [P-146] / 用尽·硬停 [P-147]，读 §5 PARAMS 单家）。
 */

import { isPeakHourBeijing, modelPriceCny } from '../config/model-pricing.js';
import { PARAMS } from '../config/params.js';
import { readUsageBudget, type UsageBudget } from '../config/usage-budget.js';
import { readUsage, type UsageRecord } from './usage-store.js';

export interface AiOpsAggregate {
  todayCny: number;
  weekCny: number;
  monthCny: number;
  totalCny: number;
  pricedCalls: number;
  unpricedCalls: number;
  /** 已计价但缺缓存拆分、按“缓存未命中”上限估算的记录数（旧记录/他方 provider） */
  pricedWithoutCacheSplit: number;
  byModel: Record<string, { calls: number; costCny: number }>;
}

/**
 * 单次调用人民币估算（按调用时刻的高峰/空闲 + DeepSeek 缓存拆分）。
 * - 模型无登记单价 → null（未计价）；
 * - 响应缺缓存拆分（旧记录/他方 provider）→ 输入按缓存未命中（上限）估算，保守不低估。
 */
export function estimateCallCostCny(record: UsageRecord): number | null {
  const price = modelPriceCny(record.model);
  if (!price) return null;
  const tier = price.byInputTiers?.find((t) => record.promptTokens >= t.minInputTokens);
  const hitPrice = tier?.inputCacheHitPerMTok ?? price.inputCacheHitPerMTok;
  const missPrice = tier?.inputCacheMissPerMTok ?? price.inputCacheMissPerMTok;
  const outputPrice = tier?.outputPerMTok ?? price.outputPerMTok;
  const factor = isPeakHourBeijing(record.ts) ? 1 : price.offpeakFactor;
  const hit = record.cacheHitTokens ?? 0;
  let miss: number;
  if (typeof record.cacheMissTokens === 'number') {
    miss = record.cacheMissTokens;
  } else if (record.cacheHitTokens !== undefined) {
    miss = Math.max(0, record.promptTokens - hit);
  } else {
    miss = record.promptTokens; // 缺缓存拆分：按缓存未命中上限估算
  }
  const cost =
    ((hit * hitPrice + miss * missPrice) / 1_000_000 +
      (record.completionTokens * outputPrice) / 1_000_000) *
    factor;
  return Math.round(cost * 10_000) / 10_000;
}

/** 按今日/近7天/本月/累计聚合人民币成本（口径同 E113 aggregateUsage） */
export function aggregateAiOpsCost(records: UsageRecord[], now = Date.now()): AiOpsAggregate {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const todayMs = startOfToday.getTime();
  const monthMs = startOfMonth.getTime();

  const agg: AiOpsAggregate = {
    todayCny: 0,
    weekCny: 0,
    monthCny: 0,
    totalCny: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    pricedWithoutCacheSplit: 0,
    byModel: {},
  };

  for (const record of records) {
    const cost = estimateCallCostCny(record);
    if (cost === null) {
      agg.unpricedCalls += 1;
      continue;
    }
    agg.pricedCalls += 1;
    if (record.cacheHitTokens === undefined && record.cacheMissTokens === undefined) {
      agg.pricedWithoutCacheSplit += 1;
    }
    agg.totalCny += cost;
    if (record.ts >= weekAgo) agg.weekCny += cost;
    if (record.ts >= todayMs) agg.todayCny += cost;
    if (record.ts >= monthMs) agg.monthCny += cost;
    const entry = agg.byModel[record.model] ?? { calls: 0, costCny: 0 };
    entry.calls += 1;
    entry.costCny += cost;
    agg.byModel[record.model] = entry;
  }

  agg.todayCny = Math.round(agg.todayCny * 100) / 100;
  agg.weekCny = Math.round(agg.weekCny * 100) / 100;
  agg.monthCny = Math.round(agg.monthCny * 100) / 100;
  agg.totalCny = Math.round(agg.totalCny * 100) / 100;
  return agg;
}

/** 硬停超限错误：日消耗 ≥ 日预算且 hardStop 开启时，付费调用前抛出（§COST C-5） */
export class AiOpsBudgetExceededError extends Error {
  readonly code = 'AI_OPS_BUDGET_EXCEEDED';

  constructor(readonly todayCny: number, readonly dailyBudgetCny: number) {
    super(
      `🚫 今日预算 ¥${dailyBudgetCny} 已用尽（实际 ¥${todayCny}）。如需继续，请追加预算（记录到裁决日志）。`,
    );
    this.name = 'AiOpsBudgetExceededError';
  }
}

export function isAiOpsBudgetExceeded(err: unknown): boolean {
  return err instanceof AiOpsBudgetExceededError;
}

/** 预调用门禁：仅 hardStop 且日预算已配置时生效，否则无副作用（非破坏） */
export function assertNotHardStopped(
  records: UsageRecord[],
  budget: UsageBudget,
  now = Date.now(),
): void {
  if (!budget.hardStop || budget.dailyBudgetCny === null) return;
  const todayCny = aggregateAiOpsCost(records, now).todayCny;
  if (todayCny >= budget.dailyBudgetCny) {
    throw new AiOpsBudgetExceededError(todayCny, budget.dailyBudgetCny);
  }
}

/** 读取默认/注入路径的预算与用量并执行硬停门禁（供 llm-client 预调用调用） */
export function assertAiOpsGate(usageFile?: string, budgetFile?: string): void {
  const budget = readUsageBudget(budgetFile);
  if (!budget.hardStop || budget.dailyBudgetCny === null) return;
  assertNotHardStopped(readUsage(usageFile), budget);
}

/** §COST C-4 阈值告警文案（黄 [P-145] / 红 [P-146] / 用尽·硬停 [P-147]），未配置预算返回空数组 */
export function buildThresholdAlerts(
  records: UsageRecord[],
  budget: UsageBudget,
  now = Date.now(),
): string[] {
  if (budget.dailyBudgetCny === null) return [];
  const todayCny = aggregateAiOpsCost(records, now).todayCny;
  const pct = (todayCny / budget.dailyBudgetCny) * 100;
  const alerts: string[] = [];
  if (pct >= PARAMS.aiOpsStopPct) {
    alerts.push(`🚫 今日预算已用尽（¥${todayCny.toFixed(2)} / ¥${budget.dailyBudgetCny}），拒绝新的付费调用`);
  } else if (pct >= PARAMS.aiOpsAlertPct) {
    alerts.push(`🔴 今日预算即将耗尽（已用 ${pct.toFixed(0)}%），建议暂停非紧急任务`);
  } else if (pct >= PARAMS.aiOpsWarnPct) {
    alerts.push(`⚠️ 今日已消耗 ¥${todayCny.toFixed(2)}，超过一半预算（¥${budget.dailyBudgetCny}）`);
  }
  return alerts;
}

/** 老板问答/CLI 报告文案：今日/本月消耗、调用数、未计价数与状态 */
export function formatAiOpsReport(
  records: UsageRecord[],
  options: { now?: number; budgetFile?: string } = {},
): string {
  const now = options.now ?? Date.now();
  const budget = readUsageBudget(options.budgetFile);
  const agg = aggregateAiOpsCost(records, now);
  const lines: string[] = ['📊 AI 运营成本'];
  lines.push(
    `• 今日: ¥${agg.todayCny.toFixed(2)}${budget.dailyBudgetCny === null ? '' : ` / 预算 ¥${budget.dailyBudgetCny}（已用 ${((agg.todayCny / budget.dailyBudgetCny) * 100).toFixed(0)}%）`}`,
  );
  lines.push(
    `• 本月: ¥${agg.monthCny.toFixed(2)}${budget.monthlyBudgetCny === null ? '' : ` / 预算 ¥${budget.monthlyBudgetCny}`}`,
  );
  lines.push(`• 调用: ${agg.pricedCalls + agg.unpricedCalls} 次（已计价 ${agg.pricedCalls}；未计价 ${agg.unpricedCalls}——单价待校准）`);
  if (agg.pricedWithoutCacheSplit > 0) {
    lines.push(`• 注: ${agg.pricedWithoutCacheSplit} 条旧记录缺缓存拆分，输入按缓存未命中（上限）估算；新调用已按缓存命中/未命中精确计价`);
  }
  const alerts = buildThresholdAlerts(records, budget, now);
  lines.push(`• 状态: ${alerts.length > 0 ? alerts.join('；') : '正常'}`);
  const byModel = Object.entries(agg.byModel).sort((a, b) => b[1].costCny - a[1].costCny);
  if (byModel.length > 0) {
    lines.push('• 模型明细（按费用）:');
    for (const [model, entry] of byModel) {
      lines.push(`  - ${model}: ¥${entry.costCny.toFixed(2)}（${entry.calls} 次）`);
    }
  }
  return lines.join('\n');
}
