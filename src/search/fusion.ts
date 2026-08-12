/**
 * Stage 4 融合层：4 串行过滤器 + 加权评分（§6.5.1/6.5.2/6.5.4）
 * 实体匹配 → 去重 → SEO 降权 → 时效加权；评分含规则① fact_consistency 与官方源乘数。
 */

import {
  extractPartNumber,
  getDomainAuthority,
  isOfficialForQuery,
  OFFICIAL_MULTIPLIER,
} from './authority.js';
import { resolveFactConsistency } from './rule1.js';
import type { SearchResultItem } from './providers/types.js';
import type { IntentKey } from './stages/s2_classify.js';

export const DISCARD_THRESHOLD = 0.4; // [P-16]
export const LOW_CONFIDENCE_THRESHOLD = 0.6; // [P-17]
export const SIMPLE_TOP_K = 3; // [P-26]

const INTENT_WEIGHTS: Record<string, [number, number, number, number]> = {
  news: [0.2, 0.5, 0.2, 0.1],
  experience: [0.3, 0.2, 0.3, 0.2],
  factual: [0.3, 0.1, 0.3, 0.3],
  troubleshooting: [0.3, 0.2, 0.3, 0.2],
  comparison: [0.3, 0.1, 0.3, 0.3],
  how_to: [0.3, 0.1, 0.4, 0.2],
  default: [0.3, 0.2, 0.3, 0.2],
};

export interface FusionItem {
  result: SearchResultItem;
  domainAuthority: number;
  official: boolean;
  seoNoise: boolean;
  relevance: number;
  timeliness: number;
  usability: number;
  factConsistency: number;
  finalScore: number;
}

export interface FusedOutput {
  items: FusionItem[];
  dropped: string[];
  gated: boolean;
  lowConfidence: boolean;
}

function queryTokens(query: string): string[] {
  return query.split(/\s+/).filter((t) => t.length >= 2);
}

function relevanceScore(query: string, item: SearchResultItem): number {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 0.5;
  const text = `${item.title} ${item.content}`.toLowerCase();
  const hits = tokens.filter((t) => text.includes(t.toLowerCase())).length;
  return hits / tokens.length;
}

function timelinessScore(item: SearchResultItem): number {
  if (!item.published) return 0.5;
  const days = (Date.now() - new Date(item.published).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 0.5;
  return Math.max(0, Math.min(1, 1 - days / 365));
}

function usabilityScore(item: SearchResultItem): number {
  const len = item.content.length;
  if (len >= 200 && /\d/.test(item.content)) return 0.8;
  if (len >= 200) return 0.6;
  return 0.4;
}

function isSeoNoise(item: SearchResultItem): boolean {
  const text = `${item.title} ${item.content}`.toLowerCase();
  if (/24小时|在线客服|人工服务|加微信|联系电话/.test(text)) return true;
  if (!/\d/.test(item.content) && item.content.length < 80) return true;
  return false;
}

function dedupe(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  const out: SearchResultItem[] = [];
  for (const item of items) {
    const key = item.url || `${item.title}|${item.content.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function entityFilter(query: string, items: SearchResultItem[]): SearchResultItem[] {
  const part = extractPartNumber(query);
  if (!part) return items;
  return items.filter((item) => `${item.title} ${item.content}`.toUpperCase().includes(part));
}

export function fuseResults(
  query: string,
  items: SearchResultItem[],
  intent: IntentKey,
  topK = SIMPLE_TOP_K,
): FusedOutput {
  const dropped: string[] = [];

  // 过滤器①：实体精确匹配
  let candidates = entityFilter(query, items);
  if (candidates.length !== items.length) {
    dropped.push(...items.filter((i) => !candidates.includes(i)).map((i) => i.url));
  }
  // 过滤器②：跨引擎去重
  candidates = dedupe(candidates);
  // 过滤器③：SEO 垃圾页标记降权
  // 过滤器④：时效权重在评分时按意图应用

  const rule1 = resolveFactConsistency(
    candidates.map((c) => ({ url: c.url, title: c.title, content: c.content, query })),
  );
  const weights = INTENT_WEIGHTS[intent] ?? INTENT_WEIGHTS.default;

  const fused: FusionItem[] = candidates.map((result) => {
    const official = isOfficialForQuery(result.url, query);
    const domainAuthority = getDomainAuthority(result.url);
    const seoNoise = isSeoNoise(result);
    const relevance = relevanceScore(query, result);
    const timeliness = timelinessScore(result);
    const usability = usabilityScore(result);
    const factConsistency = rule1.factConsistency.get(result.url) ?? 1;
    let score =
      weights[0] * relevance +
      weights[1] * timeliness +
      weights[2] * usability +
      weights[3] * factConsistency;
    if (seoNoise) score *= 0.5;
    if (official) score *= OFFICIAL_MULTIPLIER;
    return {
      result,
      domainAuthority,
      official,
      seoNoise,
      relevance,
      timeliness,
      usability,
      factConsistency,
      finalScore: Number(score.toFixed(3)),
    };
  });

  const kept = fused.filter((f) => {
    const ok = f.finalScore >= DISCARD_THRESHOLD;
    if (!ok) dropped.push(f.result.url);
    return ok;
  });
  const sorted = [...kept].sort((a, b) => b.finalScore - a.finalScore).slice(0, topK);
  const lowConfidence =
    sorted.length === 0 || sorted[0].finalScore < LOW_CONFIDENCE_THRESHOLD;

  return {
    items: sorted,
    dropped,
    gated: rule1.gated,
    lowConfidence,
  };
}
