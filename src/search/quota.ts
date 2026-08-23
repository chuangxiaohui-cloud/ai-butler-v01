/**
 * 搜索日配额（[P-63] Bocha 100 次/日，[P-65] AnySearch 1000 次/天）
 * 本地 JSON 文件持久化，按自然日计数。
 */

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export const BOCHA_DAILY_LIMIT = Number(process.env.BOCHA_DAILY_LIMIT ?? '1000000'); // [P-63] 不设硬限，默认仅观察
export const ANYSEARCH_DAILY_LIMIT = 1000; // [P-65]

export interface QuotaState {
  date: string;
  counts: Record<string, number>;
}

export interface QuotaStoreLike {
  take(key: string, limit: number): Promise<boolean>;
}

export function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// P5（架构审计 2026-08-23）：进程内按文件路径串行化读-改-写，防 gateway 多请求并发取配额丢计数
const fileLocks = new Map<string, Promise<void>>();

function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(filePath) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  fileLocks.set(filePath, tail);
  void tail.then(() => {
    if (fileLocks.get(filePath) === tail) fileLocks.delete(filePath);
  });
  return run;
}

interface PeriodQuotaState {
  counts: Record<string, number>;
  [periodKey: string]: string | Record<string, number>;
}

interface CachedFileState<T> {
  mtimeMs: number;
  state: T;
}

/** P5：单进程内配额状态缓存，跨进程写靠 mtime 变化感知（statSync 命中即复用，免重复 readFileSync+parse） */
const stateCache = new Map<string, CachedFileState<PeriodQuotaState>>();

function readStateCached(filePath: string): PeriodQuotaState | null {
  try {
    const st = statSync(filePath);
    const cached = stateCache.get(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.state;
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as PeriodQuotaState;
    stateCache.set(filePath, { mtimeMs: st.mtimeMs, state: parsed });
    return parsed;
  } catch {
    stateCache.delete(filePath);
    return null;
  }
}

/** P5：temp+rename 原子写，防读者读到半截 JSON；写后刷新缓存；失败静默（仅本次不计数） */
function writeStateAtomic(filePath: string, state: PeriodQuotaState): void {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmp, filePath);
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // 忽略清理失败
    }
    return;
  }
  try {
    const st = statSync(filePath);
    stateCache.set(filePath, { mtimeMs: st.mtimeMs, state });
  } catch {
    stateCache.delete(filePath);
  }
}

/** 日/月配额共用 take 逻辑：互斥串行化 + 原子写 + mtime 缓存 */
async function takePeriodQuota(
  filePath: string,
  periodKey: 'date' | 'month',
  current: string,
  key: string,
  limit: number,
): Promise<boolean> {
  return withFileLock(filePath, async () => {
    const cached = readStateCached(filePath);
    const state: PeriodQuotaState =
      cached && cached[periodKey] === current
        ? cached
        : ({ [periodKey]: current, counts: {} } as PeriodQuotaState);
    const used = state.counts[key] ?? 0;
    if (used >= limit) return false;
    state.counts[key] = used + 1;
    writeStateAtomic(filePath, state);
    return true;
  });
}

export class FileQuotaStore implements QuotaStoreLike {
  constructor(private readonly filePath: string) {}

  async take(key: string, limit: number): Promise<boolean> {
    return takePeriodQuota(this.filePath, 'date', localDateString(), key, limit);
  }
}

export class FileMonthlyQuotaStore implements QuotaStoreLike {
  constructor(private readonly filePath: string) {}

  async take(key: string, limit: number): Promise<boolean> {
    return takePeriodQuota(this.filePath, 'month', localDateString().slice(0, 7), key, limit);
  }
}

export const TAVILY_MONTHLY_LIMIT = 1000; // [P-64] Tavily 免费月配额（月末重置）

export interface MonthlyQuotaSnapshot {
  month: string;
  key: string;
  used: number;
  limit: number;
  remaining: number;
  ratio: number;
}

/** 只读读取月配额快照：跨月/缺失/损坏一律按 0 处理，不写文件。 */
export function readMonthlyQuota(
  filePath: string,
  key: string,
  limit: number,
): MonthlyQuotaSnapshot {
  const month = localDateString().slice(0, 7);
  let used = 0;
  try {
    const state = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      month?: string;
      counts?: Record<string, number>;
    };
    if (state.month === month) used = state.counts?.[key] ?? 0;
  } catch {
    // 文件缺失或损坏：按 0 处理
  }
  const remaining = Math.max(0, limit - used);
  return { month, key, used, limit, remaining, ratio: limit > 0 ? used / limit : 0 };
}
