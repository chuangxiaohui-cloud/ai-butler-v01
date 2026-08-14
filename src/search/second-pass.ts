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
