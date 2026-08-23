/**
 * 搜索缓存（§6.1.1）
 * TTL 按意图区分：factual [P-61] / experience [P-62] / news 不缓存。
 * v0.1 使用进程内缓存；后续可平滑替换为持久化实现而不改接口。
 * P7：容量上限 [P-110] + LRU（Map 插入序模拟），长驻 gateway 不再无界驻留死条目。
 */

import { createHash } from 'crypto';
import { PARAMS } from '../config/params.js';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const MAX_ENTRIES = PARAMS.cacheMaxEntries; // [P-110]

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
  // P7：命中刷新 LRU 序（删除重插，移到最热端）
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

export function setCache(key: string, value: string, ttlMs: number | null): void {
  if (ttlMs === null) return;
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  evictIfOverCapacity();
}

/** P7：超容量时先顺手清掉已过期条目，再按 LRU 淘汰最冷条目 */
function evictIfOverCapacity(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (store.size <= MAX_ENTRIES) break;
    if (now > v.expiresAt) store.delete(k);
  }
  for (const k of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    store.delete(k);
  }
}

export function clearCacheForTests(): void {
  store.clear();
}
