/**
 * v1.0 S7：官方 Skill 市场索引客户端（§8.2.3 来源：官方 Skill 市场索引）
 * 支持 JSON 数组 / {skills:[...]} / JSONL 三种索引格式；条目逐条校验，损坏条目跳过；
 * 拉取带大小上限与 http/https 校验（injectable fetch 便于测试）。
 */

import type { MarketSkillEntry, SkillPermission } from './types.js';

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text: string }>;

export const DEFAULT_MARKET_INDEX_MAX_BYTES = 256 * 1024;

const ENTRY_NAME_RE = /^[a-z0-9-]+$/;
const PERMISSION_SET: ReadonlySet<string> = new Set(['none', 'filesystem', 'command', 'network', 'browser']);

export function validateMarketEntry(input: unknown): MarketSkillEntry | null {
  if (typeof input !== 'object' || input === null) return null;
  const entry = input as Record<string, unknown>;
  if (typeof entry.name !== 'string' || !ENTRY_NAME_RE.test(entry.name)) return null;
  if (typeof entry.version !== 'string' || entry.version.trim().length === 0) return null;
  if (typeof entry.sourceUrl !== 'string' || !/^https?:\/\//i.test(entry.sourceUrl)) return null;
  if (!Array.isArray(entry.permissions)) return null;
  const permissions: SkillPermission[] = [];
  for (const permission of entry.permissions) {
    if (typeof permission !== 'string' || !PERMISSION_SET.has(permission)) return null;
    permissions.push(permission as SkillPermission);
  }
  return {
    name: entry.name,
    version: entry.version.trim(),
    description: typeof entry.description === 'string' ? entry.description : undefined,
    sourceUrl: entry.sourceUrl,
    permissions,
  };
}

export async function fetchMarketIndex(
  fetchFn: FetchLike,
  url: string,
  maxBytes = DEFAULT_MARKET_INDEX_MAX_BYTES,
): Promise<MarketSkillEntry[]> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('市场索引 URL 必须是 http/https');
  }
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`市场索引拉取失败：HTTP ${response.status}`);
  }
  if (Buffer.byteLength(response.text, 'utf-8') > maxBytes) {
    throw new Error(`市场索引超过大小上限 ${maxBytes} 字节`);
  }
  const entries = parseMarketIndex(response.text);
  if (entries.length === 0) {
    throw new Error('市场索引没有有效条目');
  }
  return entries;
}

/** 解析市场索引文本：JSON 数组 / {skills:[...]} / JSONL，损坏条目跳过 */
export function parseMarketIndex(text: string): MarketSkillEntry[] {
  const trimmed = text.trim();
  const out: MarketSkillEntry[] = [];
  if (!trimmed) return out;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const entry = validateMarketEntry(item);
        if (entry) out.push(entry);
      }
      return out;
    }
    if (parsed && typeof parsed === 'object') {
      const skills = (parsed as Record<string, unknown>).skills;
      if (Array.isArray(skills)) {
        for (const item of skills) {
          const entry = validateMarketEntry(item);
          if (entry) out.push(entry);
        }
        return out;
      }
    }
  } catch {
    // 非单块 JSON，回退 JSONL 逐行解析
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = validateMarketEntry(JSON.parse(line) as unknown);
      if (entry) out.push(entry);
    } catch {
      // 单行损坏忽略
    }
  }
  return out;
}
