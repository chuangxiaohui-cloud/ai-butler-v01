/**
 * low_confidence 二次取证
 *
 * 器件/资料查询融合后仍低置信时，从原始结果或融合结果中挑一个高可信
 * HTML 页，用浏览器会话抓完整正文后重新融合，提升证据质量。
 */

import { extractPartNumber, getDomainAuthority, isHighTrustDatasheetUrl } from './authority.js';
import type { FusionItem } from './fusion.js';
import type { SearchResultItem } from './providers/types.js';

export function shouldSecondPass(query: string): boolean {
  return extractPartNumber(query) !== null;
}

export function pickSecondPassTarget(
  results: SearchResultItem[],
  query: string,
  fusedItems: FusionItem[],
): SearchResultItem | null {
  const isHtml = (url: string) => !/\.pdf(\?|#|$)/i.test(url);
  const isPdf = (url: string) => /\.pdf(\?|#|$)/i.test(url);
  const highTrustHtml = results.find((r) => isHighTrustDatasheetUrl(r.url, query) && isHtml(r.url));
  if (highTrustHtml) return highTrustHtml;
  const authoritativeHtml = fusedItems.find(
    (f) => isHtml(f.result.url) && (f.official || getDomainAuthority(f.result.url) >= 0.75),
  );
  if (authoritativeHtml) return authoritativeHtml.result;
  const highTrustPdf = results.find((r) => isHighTrustDatasheetUrl(r.url, query) && isPdf(r.url));
  if (highTrustPdf) return highTrustPdf;
  const authoritativePdf = fusedItems.find(
    (f) => isPdf(f.result.url) && (f.official || getDomainAuthority(f.result.url) >= 0.75),
  );
  if (authoritativePdf) return authoritativePdf.result;
  const anyHtml = fusedItems.find((f) => isHtml(f.result.url));
  return anyHtml?.result ?? null;
}

function tokenizeQuery(query: string): string[] {
  const tokens = new Set<string>();
  for (const m of query.toLowerCase().match(/[a-z0-9][a-z0-9+#._/-]*/g) ?? []) {
    tokens.add(m);
  }
  for (const chunk of query.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (chunk.length <= 6) tokens.add(chunk);
    for (let i = 0; i + 2 <= chunk.length; i += 1) {
      tokens.add(chunk.slice(i, i + 2));
    }
  }
  return [...tokens];
}

function genericRelevance(query: string, item: SearchResultItem): number {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 0.5;
  const text = `${item.title} ${item.content}`.toLowerCase();
  const hits = tokens.filter((token) => text.includes(token)).length;
  return hits / tokens.length;
}

export function pickSecondPassTargets(
  results: SearchResultItem[],
  query: string,
  fusedItems: FusionItem[],
): SearchResultItem[] {
  if (fusedItems.length > 0) {
    const primary = pickSecondPassTarget(results, query, fusedItems);
    if (primary) return [primary];
  }
  const isPdf = (url: string) => /\.pdf(\?|#|$)/i.test(url);
  const ranked = results
    .map((result) => ({ result, score: genericRelevance(query, result) }))
    .sort((a, b) => b.score - a.score);
  const html = ranked.filter((entry) => !isPdf(entry.result.url)).slice(0, 2);
  if (html.length > 0) return html.map((entry) => entry.result);
  return ranked.slice(0, 1).map((entry) => entry.result);
}
