/**
 * 搜索缓存（§6.1.1）
 * TTL 按意图区分：factual [P-61] / experience [P-62] / news 不缓存。
 * v0.1 使用进程内缓存；后续可平滑替换为持久化实现而不改接口。
 */

import { createHash } from 'crypto';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export function hashQuery(query: string): string {
  return createHash('sha256').update(query).digest('hex').slice(0, 32);
}

export function ttlForIntent(intent: string): number | null {
  const DAY_MS = 24 * 60 * 60 * 1000;
  switch (intent) {
    case 'factual':
      return 7 * DAY_MS; // [P-61]
    case 'experience':
      return 30 * DAY_MS; // [P-62]
    default:
      return null; // news 等不缓存
  }
}

export function getCache(key: string): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache(key: string, value: string, ttlMs: number | null): void {
  if (ttlMs === null) return;
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearCacheForTests(): void {
  store.clear();
}
