/**
 * E318：AI 运营日报 / 预算阈值事件 → 通知枢纽（§COST C-7 / §11.3 秘书日报）
 * 复用 E315/E316 通知库（data/notifications.jsonl，env NOTIFICATION_LOG_PATH 可覆盖）：
 * 秘书角色按天生成「AI 运营日报」，并在日消耗跨过黄/红/用尽阈值档位时自动写入预算告警事件。
 * 去重：日报按日期 marker；阈值事件按「当日已触发最高档位」单调去重，避免重复刷屏。
 * 写入失败一律吞掉（通知旁路），不阻塞任何主流程。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PARAMS } from '../config/params.js';
import { readUsageBudget } from '../config/usage-budget.js';
import {
  NotificationStore,
  notificationLogPath,
  type NotificationEntry,
} from '../notifications/notification-store.js';
import { aggregateAiOpsCost, buildThresholdAlerts, formatAiOpsReport } from './cost.js';
import { readUsage } from './usage-store.js';

/** §COST C-4 档位：0 正常（< 黄）→ 1 黄（≥ [P-145]）→ 2 红（≥ [P-146]）→ 3 用尽（≥ [P-147]） */
export type AiOpsBudgetBand = 0 | 1 | 2 | 3;

interface DateMarker {
  date: string;
}

interface BudgetMarker {
  date: string;
  band: AiOpsBudgetBand;
}

/** marker 目录与通知库同目录，测试可用 env 指向临时目录（隔离，不污染仓库 data/） */
function markerDir(): string {
  return join(dirname(notificationLogPath()), 'ai-ops');
}

export function aiOpsReportMarkerPath(): string {
  return process.env.AI_OPS_REPORT_MARKER ?? join(markerDir(), 'report-marker.json');
}

export function aiOpsBudgetMarkerPath(): string {
  return process.env.AI_OPS_BUDGET_MARKER ?? join(markerDir(), 'budget-marker.json');
}

export function todayKey(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

export function reportDateLabel(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`, 'utf-8');
}

/** 档位判定：日消耗/日预算 ×100 ≥ 用尽/红/黄阈值时依次取 3/2/1（阈值读 §5 PARAMS 单家） */
export function aiOpsBudgetBand(
  todayCny: number,
  dailyBudgetCny: number | null,
): AiOpsBudgetBand {
  if (dailyBudgetCny === null || dailyBudgetCny <= 0) return 0;
  const pct = (todayCny / dailyBudgetCny) * 100;
  if (pct >= PARAMS.aiOpsStopPct) return 3;
  if (pct >= PARAMS.aiOpsAlertPct) return 2;
  if (pct >= PARAMS.aiOpsWarnPct) return 1;
  return 0;
}

export interface AiOpsNotifyOptions {
  now?: number;
  usageFile?: string;
  budgetFile?: string;
  markerFile?: string;
  /** 测试可注入内存/临时 store；缺省写仓库通知库 */
  store?: Pick<NotificationStore, 'add'>;
}

function addNotification(
  event: { role: string; kind: string; title: string; detail?: string; ts?: string },
  store?: Pick<NotificationStore, 'add'>,
): NotificationEntry | undefined {
  try {
    const s = store ?? new NotificationStore();
    try {
      return s.add({ ...event, source: 'usage' });
    } finally {
      if (!store) (s as NotificationStore).close();
    }
  } catch {
    return undefined; // 通知旁路：写入失败不抛错
  }
}

/**
 * 每日 AI 运营日报（§COST C-7 / §11.3）：按日期幂等，gateway 22:00 定时、启动补发与
 * 手动 `npm run ai-ops:report` 共用同一入口，重复触发返回 dup。
 */
export function emitAiOpsDailyReport(
  options: AiOpsNotifyOptions = {},
): { status: 'emitted' | 'dup'; entry?: NotificationEntry } {
  const now = options.now ?? Date.now();
  const markerFile = options.markerFile ?? aiOpsReportMarkerPath();
  const key = todayKey(now);
  if (readJson<DateMarker>(markerFile)?.date === key) return { status: 'dup' };
  const detail = formatAiOpsReport(readUsage(options.usageFile), {
    now,
    budgetFile: options.budgetFile,
  });
  const entry = addNotification(
    {
      role: '秘书',
      kind: 'ai_ops_daily',
      title: `AI 运营日报（${reportDateLabel(now)}）`,
      detail,
      ts: new Date(now).toISOString(),
    },
    options.store,
  );
  writeJson(markerFile, { date: key });
  return { status: 'emitted', entry };
}

/**
 * 预算阈值事件（§COST C-4 黄/红/用尽）：日消耗跨入更高档位时写入一次告警事件；
 * 未跨档（含已触发过的最高档位）不重复写。预算未配置返回空，无副作用。
 */
export function emitAiOpsBudgetAlerts(
  options: AiOpsNotifyOptions = {},
): {
  emitted: boolean;
  band: AiOpsBudgetBand;
  todayCny: number;
  dailyBudgetCny: number | null;
  alerts: string[];
} {
  const now = options.now ?? Date.now();
  const budget = readUsageBudget(options.budgetFile);
  if (budget.dailyBudgetCny === null) {
    return { emitted: false, band: 0, todayCny: 0, dailyBudgetCny: null, alerts: [] };
  }
  const records = readUsage(options.usageFile);
  const agg = aggregateAiOpsCost(records, now);
  const band = aiOpsBudgetBand(agg.todayCny, budget.dailyBudgetCny);
  const markerFile = options.markerFile ?? aiOpsBudgetMarkerPath();
  const marker = readJson<BudgetMarker>(markerFile);
  const prevBand = marker?.date === todayKey(now) ? marker.band : 0;
  if (band <= prevBand) {
    return {
      emitted: false,
      band,
      todayCny: agg.todayCny,
      dailyBudgetCny: budget.dailyBudgetCny,
      alerts: [],
    };
  }
  const alerts = buildThresholdAlerts(records, budget, now);
  if (alerts.length > 0) {
    const pct = Math.round((agg.todayCny / budget.dailyBudgetCny) * 100);
    addNotification(
      {
        role: '秘书',
        kind: 'ai_ops_budget_alert',
        title: alerts[0],
        detail:
          `累计今日 ¥${agg.todayCny.toFixed(2)} / 预算 ¥${budget.dailyBudgetCny.toFixed(2)}（已用 ${pct}%）` +
          (alerts.length > 1 ? `；${alerts.slice(1).join('；')}` : ''),
        ts: new Date(now).toISOString(),
      },
      options.store,
    );
  }
  writeJson(markerFile, { date: todayKey(now), band });
  return {
    emitted: alerts.length > 0,
    band,
    todayCny: agg.todayCny,
    dailyBudgetCny: budget.dailyBudgetCny,
    alerts,
  };
}
