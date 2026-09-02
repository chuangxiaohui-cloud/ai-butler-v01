/**
 * Token 计量存储（E113）
 * OpenAI 兼容客户端每次调用后记录 usage，聚合今日/近7天/本月。
 */

import { join } from 'path';
import { appendJsonl, readJsonlCached } from '../log/jsonl.js';

export interface UsageRecord {
  ts: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** DeepSeek usage 缓存命中输入 token（旧记录/他方 provider 可能缺省） */
  cacheHitTokens?: number;
  /** DeepSeek usage 缓存未命中输入 token（旧记录/他方 provider 可能缺省） */
  cacheMissTokens?: number;
}

export function usagePath(root = process.cwd()): string {
  return join(root, 'data', 'usage.jsonl');
}

export function recordUsage(record: UsageRecord, file = usagePath()): void {
  appendJsonl(file, JSON.stringify(record));
}

function parseUsageLine(line: string): UsageRecord | null {
  try {
    const raw = JSON.parse(line) as Partial<UsageRecord>;
    if (
      typeof raw.ts !== 'number' ||
      typeof raw.promptTokens !== 'number' ||
      typeof raw.completionTokens !== 'number'
    ) {
      return null;
    }
    return {
      ts: raw.ts,
      provider: typeof raw.provider === 'string' ? raw.provider : 'unknown',
      model: typeof raw.model === 'string' ? raw.model : 'unknown',
      promptTokens: raw.promptTokens,
      completionTokens: raw.completionTokens,
      cacheHitTokens: typeof raw.cacheHitTokens === 'number' ? raw.cacheHitTokens : undefined,
      cacheMissTokens: typeof raw.cacheMissTokens === 'number' ? raw.cacheMissTokens : undefined,
    };
  } catch {
    return null;
  }
}

// P15：mtime+size 缓存读，避免每次全量解析整文件
export function readUsage(file = usagePath()): UsageRecord[] {
  return readJsonlCached(file, parseUsageLine);
}

export interface UsageStats {
  todayTokens: number;
  weekTokens: number;
  monthTokens: number;
  totalTokens: number;
  byModel: Record<string, { promptTokens: number; completionTokens: number }>;
}

export function aggregateUsage(records: UsageRecord[], now = Date.now()): UsageStats {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const todayMs = startOfToday.getTime();
  const monthMs = startOfMonth.getTime();

  const byModel: UsageStats['byModel'] = {};
  let todayTokens = 0;
  let weekTokens = 0;
  let monthTokens = 0;
  let totalTokens = 0;
  for (const record of records) {
    const tokens = record.promptTokens + record.completionTokens;
    totalTokens += tokens;
    if (record.ts >= todayMs) todayTokens += tokens;
    if (record.ts >= weekAgo) weekTokens += tokens;
    if (record.ts >= monthMs) monthTokens += tokens;
    const model = byModel[record.model] ?? { promptTokens: 0, completionTokens: 0 };
    model.promptTokens += record.promptTokens;
    model.completionTokens += record.completionTokens;
    byModel[record.model] = model;
  }
  return { todayTokens, weekTokens, monthTokens, totalTokens, byModel };
}
