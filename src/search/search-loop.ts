/**
 * Stage 3 子搜索循环（复杂 query 拆 3-10 次子搜索）
 * 查询改写 → 子搜索 → LLM 覆盖度判断 → 追加/换方向，直到足够或预算耗尽。
 */

import { createHash } from 'crypto';
import { join } from 'path';

import type { LLMClient } from './llm.js';
import type { SearchProvider, SearchResultItem } from './providers/types.js';
import {
  runSearchStage,
  type SearchStageOptions,
  type SearchStageResult,
} from './stages/s3_search.js';
import { rewriteQuery } from './query-rewrite.js';
import {
  DOMESTIC_DATASHEET_DOMAINS,
  DOMESTIC_DATASHEET_SITES,
  extractPartNumber,
  isDomesticDatasheetUrl,
  isHighTrustDatasheetUrl,
  officialSourceHintForQuery,
  techOfficialDomainsForQuery,
} from './authority.js';
import { FileMonthlyQuotaStore, TAVILY_MONTHLY_LIMIT } from './quota.js';
import { tavilyProvider } from './providers/tavily.js';
import type { SearchSourceStats } from './source-stats.js';

export const DEFAULT_MAX_SUB_SEARCHES = 5; // [P-85]
export const DEFAULT_MIN_RESULTS = 5; // [P-86]

export interface BrowserFetcher {
  fetchPage(
    url: string,
    timeoutMs?: number,
    waitMs?: number,
  ): Promise<{ url: string; title: string; text: string }>;
  searchWeb?(
    query: string,
    opts?: { engine?: 'bing' | 'baidu'; count?: number },
  ): Promise<SearchResultItem[]>;
  downloadFile(
    url: string,
    destPath: string,
    headers?: Record<string, string>,
  ): Promise<{ ok: boolean; size: number; error?: string }>;
}

export interface SearchLoopOptions extends Omit<SearchStageOptions, 'cacheKey'> {
  cacheKey?: string;
  originalQuery?: string;
  llm?: LLMClient;
  maxSubSearches?: number;
  minResults?: number;
  sourceStats?: Pick<SearchSourceStats, 'record'>;
  officialProvider?: SearchProvider;
  browserSession?: BrowserFetcher;
}

export interface SearchLoopResult extends SearchStageResult {
  subQueries: string[];
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

function hashQuery(query: string): string {
  return createHash('sha1').update(query).digest('hex').slice(0, 12);
}

function uniqueUrls(items: SearchResultItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (item.url && !seen.has(item.url)) {
      seen.add(item.url);
      out.push(item.url);
    }
  }
  return out;
}

export function buildEmptyFallbackQueries(query: string, originalQuery?: string): string[] {
  const out: string[] = [];
  const simplified = (originalQuery ?? query)
    .replace(/[（(][^）)]*[)）]/g, ' ')
    .replace(/[？?。！!，,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(如何|怎么|怎样|帮我|请帮我|团队|我们|我想|需要|请问|请)\s*/g, '')
    .trim();
  if (originalQuery && !out.includes(originalQuery)) out.push(originalQuery);
  if (simplified && !out.includes(simplified)) out.push(simplified);
  if (query && !out.includes(query)) out.push(query);
  for (const domain of techOfficialDomainsForQuery(query)) {
    const officialQuery = `${simplified || query} site:${domain}`;
    if (!out.includes(officialQuery)) out.push(officialQuery);
  }
  return out.slice(0, 4);
}

export function buildCoverageJudgeMessages(
  query: string,
  subQuery: string,
  results: SearchResultItem[],
): Array<{ role: 'system' | 'user'; content: string }> {
  const top = results
    .slice(0, 8)
    .map((r, i) => `${i + 1}. ${r.title}（${r.url}）\n${r.content.slice(0, 120)}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        '你是搜索覆盖度判断器。判断当前结果是否足够回答用户问题。只输出 JSON：{"enough": true|false, "moreQueries": ["..."], "reason": "..."}。',
    },
    {
      role: 'user',
      content: `用户问题：${query}\n当前子查询：${subQuery}\n已收集结果数：${results.length}\nTop 结果：\n${top}`,
    },
  ];
}

async function judgeCoverage(
  query: string,
  subQuery: string,
  results: SearchResultItem[],
  llm: LLMClient | undefined,
  minResults: number,
): Promise<{ enough: boolean; moreQueries: string[] }> {
  if (!llm) {
    return { enough: results.length >= minResults, moreQueries: [] };
  }
  try {
    const raw = await llm.complete(buildCoverageJudgeMessages(query, subQuery, results), {
      temperature: 0,
      maxTokens: 200,
      json: true,
    });
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed =
      start >= 0 && end > start
        ? (JSON.parse(raw.slice(start, end + 1)) as { enough?: unknown; moreQueries?: unknown })
        : null;
    const enough = parsed?.enough === true;
    const moreQueries = Array.isArray(parsed?.moreQueries)
      ? parsed.moreQueries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 2)
      : [];
    return { enough, moreQueries };
  } catch {
    return { enough: results.length >= minResults, moreQueries: [] };
  }
}

export async function runSearchLoop(
  query: string,
  opts: SearchLoopOptions,
): Promise<SearchLoopResult> {
  const start = Date.now();
  const maxSubSearches = opts.maxSubSearches ?? DEFAULT_MAX_SUB_SEARCHES;
  const minResults = opts.minResults ?? DEFAULT_MIN_RESULTS;
  const rewritten = await rewriteQuery(query, opts.intent, opts.llm);
  // E239 修正：规则改写可能生成大量 datasheet 子查询把原查询挤出 [P-85] 5 次预算，
  // 原查询最先搜索（最忠实于用户问题的子查询），官方/专业站子查询在 judge 判定不足时继续追加。
  const queue = [query, ...rewritten.queries.filter((q) => q !== query)];
  const seenQueries = new Set<string>(queue);
  let results: SearchResultItem[] = [];
  const attempts: SearchStageResult['attempts'] = [];
  const notices: string[] = [];
  const aiAnswers: string[] = [];
  const subQueries: string[] = [];
  let cacheHit = false;
  let cacheEngines: SearchStageResult['cacheEngines'] = null;
  let degraded = false;

  for (let i = 0; i < maxSubSearches && queue.length > 0; i += 1) {
    const subQuery = queue.shift()!;
    subQueries.push(subQuery);
    const stage = await runSearchStage(subQuery, {
      ...opts,
      cacheKey: `search:loop:${hashQuery(subQuery)}:${i}`,
      cachedValue: null,
    });
    results.push(...stage.results);
    attempts.push(...stage.attempts);
    aiAnswers.push(...stage.aiAnswers);
    notices.push(...(stage.notices ?? []));
    for (const attempt of stage.attempts) {
      opts.sourceStats?.record(attempt.provider, opts.intent, attempt.ok, attempt.latencyMs);
    }
    if (stage.cacheHit) cacheHit = true;
    if (stage.cacheEngines) cacheEngines = stage.cacheEngines;
    if (stage.degraded && results.length === 0) degraded = true;

    const judge = await judgeCoverage(query, subQuery, results, opts.llm, minResults);
    for (const next of judge.moreQueries) {
      if (!seenQueries.has(next)) {
        seenQueries.add(next);
        queue.push(next);
      }
    }
    if (judge.enough) break;
  }

  if (results.length === 0) {
    for (const fallbackQuery of buildEmptyFallbackQueries(query, opts.originalQuery)) {
      if (seenQueries.has(fallbackQuery)) continue;
      seenQueries.add(fallbackQuery);
      subQueries.push(fallbackQuery);
      const stage = await runSearchStage(fallbackQuery, {
        ...opts,
        cacheKey: `search:loop:empty-retry:${hashQuery(fallbackQuery)}`,
        cachedValue: null,
      });
      results.push(...stage.results);
      attempts.push(...stage.attempts);
      aiAnswers.push(...stage.aiAnswers);
      notices.push(...(stage.notices ?? []));
      for (const attempt of stage.attempts) {
        opts.sourceStats?.record(attempt.provider, opts.intent, attempt.ok, attempt.latencyMs);
      }
      if (stage.cacheHit) cacheHit = true;
      if (stage.cacheEngines) cacheEngines = stage.cacheEngines;
      if (stage.degraded && results.length === 0) degraded = true;
      if (results.length > 0) break;
    }
  }

  if (results.length === 0 && opts.browserSession?.searchWeb) {
    const engines = ['bing', 'baidu'] as const;
    for (const fallbackQuery of buildEmptyFallbackQueries(query, opts.originalQuery)) {
      if (results.length > 0) break;
      for (const engine of engines) {
        if (results.length > 0) break;
        const attemptStart = Date.now();
        try {
          const items = await opts.browserSession.searchWeb(fallbackQuery, {
            engine,
            count: 8,
          });
          const ok = items.length > 0;
          attempts.push({
            provider: 'browser',
            ok,
            latencyMs: Date.now() - attemptStart,
            error: ok ? undefined : '浏览器搜索无结果',
          });
          opts.sourceStats?.record('browser', opts.intent, ok, Date.now() - attemptStart);
          if (ok) results.push(...items);
        } catch (err) {
          attempts.push({
            provider: 'browser',
            ok: false,
            latencyMs: Date.now() - attemptStart,
            error: err instanceof Error ? err.message : String(err),
          });
          opts.sourceStats?.record('browser', opts.intent, false, Date.now() - attemptStart);
        }
      }
    }
  }

  const part = extractPartNumber(query);
  const hasHighTrustSource = () => results.some((r) => isHighTrustDatasheetUrl(r.url, query));
  const needsMoreEvidence = () => !hasHighTrustSource() || results.length < minResults;
  let browserCovered = false;
  if (part && needsMoreEvidence() && opts.browserSession) {
    for (const url of uniqueUrls(results).slice(0, 2)) {
      const attemptStart = Date.now();
      try {
        const page = await opts.browserSession.fetchPage(url, 8000);
        const ok = page.text.trim().length > 0;
        attempts.push({
          provider: 'browser',
          ok,
          latencyMs: Date.now() - attemptStart,
          error: ok ? undefined : '空正文',
        });
        opts.sourceStats?.record('browser', opts.intent, ok, Date.now() - attemptStart);
        if (ok) {
          results.push({
            title: page.title || url,
            url: page.url,
            content: page.text.slice(0, 5000),
            provider: 'browser',
          });
        }
      } catch (err) {
        attempts.push({
          provider: 'browser',
          ok: false,
          latencyMs: Date.now() - attemptStart,
          error: err instanceof Error ? err.message : String(err),
        });
        opts.sourceStats?.record('browser', opts.intent, false, Date.now() - attemptStart);
      }
    }
    browserCovered = hasHighTrustSource() && results.length >= minResults;
  }

  const officialHint = officialSourceHintForQuery(query);
  const techDomains = techOfficialDomainsForQuery(query);
  if (
    opts.tavily?.enabled &&
    (part || techDomains.length > 0) &&
    !browserCovered &&
    needsMoreEvidence()
  ) {
    const officialProvider = opts.officialProvider ?? tavilyProvider;
    // H9：先攒查询再消耗配额——无型号时只发 site: 定向查询，
    // `${part} … datasheet` 类补搜仅在 part 非空时加入，杜绝 "null 立创商城 …"。
    const fallbackSearches: Array<{
      query: string;
      includeDomains: string[];
    }> = [];
    for (const domain of techDomains) {
      fallbackSearches.push({
        query: `${query} site:${domain}`,
        includeDomains: [domain],
      });
    }
    if (officialHint && part) {
      fallbackSearches.push({
        query: `${part} ${officialHint.domain} datasheet`,
        includeDomains: [officialHint.domain],
      });
    }
    if (part) {
      fallbackSearches.push({
        query: `${part} 立创商城 芯查查 半导小芯 datasheet`,
        includeDomains: DOMESTIC_DATASHEET_DOMAINS,
      });
    }
    // 无任何可发查询（理论不可达：外层条件保证 part 或 techDomains 非空）——不消耗配额
    if (fallbackSearches.length > 0) {
      const monthly =
        opts.tavilyMonthlyQuota ??
        new FileMonthlyQuotaStore(join(process.cwd(), 'data', 'tavily-monthly.json'));
      const allowed = await monthly.take('tavily', TAVILY_MONTHLY_LIMIT);
      if (allowed) {
        // H9：补搜相互独立（不同 includeDomains），并联把尾部延迟压到单次超时
        const started = Date.now();
        const settled = await Promise.allSettled(
          fallbackSearches.map((fallback) =>
            officialProvider.search(fallback.query, {
              includeDomains: fallback.includeDomains,
              timeoutMs: 5000,
            }),
          ),
        );
        settled.forEach((result, i) => {
          const fallback = fallbackSearches[i];
          if (result.status === 'fulfilled') {
            const fallbackSearch = result.value;
            attempts.push({
              provider: fallbackSearch.provider,
              ok: fallbackSearch.ok,
              latencyMs: fallbackSearch.latencyMs,
              error: fallbackSearch.error,
            });
            opts.sourceStats?.record(
              fallbackSearch.provider,
              opts.intent,
              fallbackSearch.ok,
              fallbackSearch.latencyMs,
            );
            if (fallbackSearch.ok) results.push(...fallbackSearch.results);
          } else {
            const reason =
              result.reason instanceof Error ? result.reason.message : String(result.reason);
            attempts.push({
              provider: officialProvider.id,
              ok: false,
              latencyMs: Date.now() - started,
              error: reason,
            });
            opts.sourceStats?.record(officialProvider.id, opts.intent, false, Date.now() - started);
          }
        });
      }
    }
  }

  // 用户点名国内资料站时，若搜索引擎没命中对应域名，用浏览器直达站内搜索补证据
  if (part && opts.browserSession) {
    const mentionQuery = opts.originalQuery ?? query;
    for (const site of DOMESTIC_DATASHEET_SITES) {
      if (!new RegExp(`${site.name}|${site.domain}`, 'i').test(mentionQuery)) continue;
      if (
        results.some((r) => isDomesticDatasheetUrl(r.url) && r.url.includes(site.domain))
      ) {
        continue;
      }
      const searchUrl = site.searchUrl(part);
      const attemptStart = Date.now();
      try {
        const page = await opts.browserSession.fetchPage(searchUrl, 8_000, 3_000);
        const ok = page.text.trim().length > 0;
        attempts.push({
          provider: 'browser',
          ok,
          latencyMs: Date.now() - attemptStart,
          error: ok ? undefined : '空正文',
        });
        opts.sourceStats?.record('browser', opts.intent, ok, Date.now() - attemptStart);
        if (ok) {
          results.push({
            title: `${site.name} - ${part}`,
            url: page.url,
            content: page.text.slice(0, 5_000),
            provider: 'browser',
          });
        }
      } catch (err) {
        attempts.push({
          provider: 'browser',
          ok: false,
          latencyMs: Date.now() - attemptStart,
          error: err instanceof Error ? err.message : String(err),
        });
        opts.sourceStats?.record('browser', opts.intent, false, Date.now() - attemptStart);
      }
    }
  }

  return {
    results: dedupe(results),
    attempts,
    cacheHit,
    cacheEngines,
    degraded,
    elapsedMs: Date.now() - start,
    aiAnswers,
    notices,
    subQueries,
  };
}
