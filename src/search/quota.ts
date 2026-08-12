/**
 * 搜索日配额（[P-63] Bocha 100 次/日，[P-65] AnySearch 1000 次/天）
 * 本地 JSON 文件持久化，按自然日计数。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
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

export class FileQuotaStore implements QuotaStoreLike {
  constructor(private readonly filePath: string) {}

  async take(key: string, limit: number): Promise<boolean> {
    const today = localDateString();
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
    const month = localDateString().slice(0, 7);
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
