/**
 * Provider 默认顺序持久化（E111）
 * UI“设为默认”写入 data/provider-order.json，registry 运行时读取。
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export function providerOrderPath(root = process.cwd()): string {
  return join(root, 'data', 'provider-order.json');
}

// P3（架构审计 2026-08-23）：按 mtime 缓存，statSync 命中即返回，免每次 existsSync+readFileSync+parse
let providerOrderCache: { file: string; mtimeMs: number; order: string[] | null } | null = null;

export function readProviderOrder(file = providerOrderPath()): string[] | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    providerOrderCache = null;
    return null;
  }
  if (providerOrderCache && providerOrderCache.file === file && providerOrderCache.mtimeMs === mtimeMs) {
    return providerOrderCache.order;
  }
  let order: string[] | null = null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as { order?: unknown };
    if (Array.isArray(raw.order)) {
      const filtered = raw.order.filter((item): item is string => typeof item === 'string');
      if (filtered.length > 0) order = filtered;
    }
  } catch {
    order = null;
  }
  providerOrderCache = { file, mtimeMs, order };
  return order;
}

export function writeProviderOrder(order: string[], file = providerOrderPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ order }, null, 2)}\n`, 'utf-8');
  providerOrderCache = null; // 写后显式失效，下次读取重新 stat+parse
}
