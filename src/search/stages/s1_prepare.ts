/**
 * Stage 1 预处理（§6.1.1）
 * 黑话映射（快路径）→ 脱敏 → 指代消解/澄清判定 → 缓存检查。
 * 记忆调用（L1-L3）在 WP8 接入，此处保留 memoryNotes 槽位。
 */

import { getCache, hashQuery } from '../cache.js';

export interface ClarifySuggestion {
  reason: string;
  question: string;
}

export interface PreparedQuery {
  originalQuery: string;
  cleanQuery: string;
  cacheKey: string;
  cachedValue: string | null;
  clarify: ClarifySuggestion | null;
  memoryNotes: string[];
}

const DEFAULT_JARGON_MAP: Record<string, string> = {
  protel: 'Altium Designer',
};

const SENSITIVE_PATTERNS = [
  /[A-Za-z]:\\[^\s,，。；;]+/g,
  /(?:https?:\/\/)?\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /(?:C:\\Users\\[^\\]+|~\\)[^\s,，。；;]*/g,
];

const PRONOUN_RE = /(这个|那个|这|那)(芯片|器件|项目|软件|型号|板子|板卡)/;
const PART_NUMBER_RE = /[A-Z]{2,}[0-9A-Z-]{2,}|[A-Z]{2,}[0-9]{2,}/;

export function applyJargonMap(
  query: string,
  map: Record<string, string> = DEFAULT_JARGON_MAP,
): string {
  let out = query;
  for (const [key, value] of Object.entries(map)) {
    out = out.replace(new RegExp(key, 'ig'), value);
  }
  return out;
}

export function sanitizeQuery(query: string): string {
  let out = query;
  for (const pattern of SENSITIVE_PATTERNS) out = out.replace(pattern, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function detectClarify(query: string): ClarifySuggestion | null {
  if (PRONOUN_RE.test(query) && !PART_NUMBER_RE.test(query)) {
    return {
      reason: 'pronoun_unresolved',
      question: '你说的是哪个芯片/项目？给我具体型号或链接。',
    };
  }
  return null;
}

export function prepareQuery(query: string): PreparedQuery {
  const cleanQuery = sanitizeQuery(applyJargonMap(query));
  const cacheKey = `search:${hashQuery(cleanQuery)}`;
  return {
    originalQuery: query,
    cleanQuery,
    cacheKey,
    cachedValue: getCache(cacheKey),
    clarify: detectClarify(query),
    memoryNotes: [],
  };
}
