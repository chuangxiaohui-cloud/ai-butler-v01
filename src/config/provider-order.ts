/**
 * Provider 默认顺序持久化（E111）
 * UI“设为默认”写入 data/provider-order.json，registry 运行时读取。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export function providerOrderPath(root = process.cwd()): string {
  return join(root, 'data', 'provider-order.json');
}

export function readProviderOrder(file = providerOrderPath()): string[] | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as { order?: unknown };
    if (!Array.isArray(raw.order)) return null;
    const order = raw.order.filter((item): item is string => typeof item === 'string');
    return order.length > 0 ? order : null;
  } catch {
    return null;
  }
}

export function writeProviderOrder(order: string[], file = providerOrderPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ order }, null, 2)}\n`, 'utf-8');
}
