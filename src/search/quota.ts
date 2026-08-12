/**
 * 搜索日配额（[P-63] Bocha 100 次/日，[P-65] AnySearch 1000 次/天）
 * 本地 JSON 文件持久化，按自然日计数。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export const BOCHA_DAILY_LIMIT = 100; // [P-63]
export const ANYSEARCH_DAILY_LIMIT = 1000; // [P-65]

export interface QuotaState {
  date: string;
  counts: Record<string, number>;
}

export interface QuotaStoreLike {
  take(key: string, limit: number): Promise<boolean>;
}

export class FileQuotaStore implements QuotaStoreLike {
  constructor(private readonly filePath: string) {}

  async take(key: string, limit: number): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    let state: QuotaState = { date: today, counts: {} };
    try {
      state = JSON.parse(readFileSync(this.filePath, 'utf-8')) as QuotaState;
    } catch {
      // 首次使用或文件损坏：从空状态开始
    }
    if (state.date !== today) state = { date: today, counts: {} };
    const used = state.counts[key] ?? 0;
    if (used >= limit) return false;
    state.counts[key] = used + 1;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // 配额文件写失败不阻塞搜索，仅本次不计数
    }
    return true;
  }
}

export class FileMonthlyQuotaStore implements QuotaStoreLike {
  constructor(private readonly filePath: string) {}

  async take(key: string, limit: number): Promise<boolean> {
    const month = new Date().toISOString().slice(0, 7);
    let state: { month: string; counts: Record<string, number> } = { month, counts: {} };
    try {
      state = JSON.parse(readFileSync(this.filePath, 'utf-8')) as typeof state;
    } catch {
      // 首次使用或文件损坏
    }
    if (state.month !== month) state = { month, counts: {} };
    const used = state.counts[key] ?? 0;
    if (used >= limit) return false;
    state.counts[key] = used + 1;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // 配额文件写失败不阻塞
    }
    return true;
  }
}
