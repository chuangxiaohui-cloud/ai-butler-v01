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
} from './authority.js';
import { FileMonthlyQuotaStore } from './quota.js';
import { tavilyProvider } from './providers/tavily.js';
import type { SearchSourceStats } from './source-stats.js';

export const DEFAULT_MAX_SUB_SEARCHES = 5; // [P-85]
export const DEFAULT_MIN_RESULTS = 5; // [P-86]
const TAVILY_MONTHLY_LIMIT = 1000; // [P-64]

export interface BrowserFetcher {
  fetchPage(
    url: string,
    timeoutMs?: number,
    waitMs?: number,
  ): Promise<{ url: string; title: string; text: string }>;
  downloadFile(
    url: string,
    destPath: string,
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
  const queue = [...rewritten.queries];
  const seenQueries = new Set<string>(rewritten.queries);
  let results: SearchResultItem[] = [];
  const attempts: SearchStageResult['attempts'] = [];
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
  if (opts.tavily?.enabled && part && !browserCovered && needsMoreEvidence()) {
    const officialProvider = opts.officialProvider ?? tavilyProvider;
    const monthly =
      opts.tavilyMonthlyQuota ??
      new FileMonthlyQuotaStore(join(process.cwd(), 'data', 'tavily-monthly.json'));
    const allowed = await monthly.take('tavily', TAVILY_MONTHLY_LIMIT);
    if (allowed) {
      const fallbackSearches: Array<{
        query: string;
        includeDomains: string[];
      }> = [];
      if (officialHint) {
        fallbackSearches.push({
          query: `${part} ${officialHint.domain} datasheet`,
          includeDomains: [officialHint.domain],
        });
      }
      fallbackSearches.push({
        query: `${part} 立创商城 芯查查 半导小芯 datasheet`,
        includeDomains: DOMESTIC_DATASHEET_DOMAINS,
      });
      for (const fallback of fallbackSearches) {
        const fallbackSearch = await officialProvider.search(fallback.query, {
          includeDomains: fallback.includeDomains,
          timeoutMs: 5000,
        });
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
    subQueries,
  };
}
