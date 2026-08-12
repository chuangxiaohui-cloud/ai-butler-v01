/**
 * Stage 3 搜索执行（§6.2 + §6.7）
 * Bocha + AnySearch 并行常开，总预算 [P-02]，超时单路由另一路兜底。
 */

import { join } from 'path';
import { getCache, setCache, ttlForIntent } from '../cache.js';
import { logSearchRequest } from '../metrics.js';
import type { QuotaStoreLike } from '../quota.js';
import {
  ANYSEARCH_DAILY_LIMIT,
  BOCHA_DAILY_LIMIT,
  FileQuotaStore,
  FileMonthlyQuotaStore,
} from '../quota.js';
import { anysearchProvider } from '../providers/anysearch.js';
import { bochaProvider } from '../providers/bocha.js';
import { tavilyProvider } from '../providers/tavily.js';
import type { ProviderId, SearchProvider, SearchProviderResult, SearchResultItem } from '../providers/types.js';
import type { IntentKey } from './s2_classify.js';
import type { TavilyTrigger } from '../tavily-trigger.js';

const DEFAULT_BUDGET_MS = 5000; // [P-02]
const TAVILY_MONTHLY_LIMIT = 1000; // [P-64]

export interface SearchAttempt {
  provider: ProviderId;
  ok: boolean;
  latencyMs: number;
  error?: string;
  quotaSkipped?: boolean;
}

export interface SearchStageResult {
  results: SearchResultItem[];
  attempts: SearchAttempt[];
  cacheHit: boolean;
  cacheEngines: 'both' | 'single' | null;
  degraded: boolean;
  elapsedMs: number;
  aiAnswers: string[];
}

export interface SearchStageOptions {
  intent: IntentKey;
  cacheKey?: string;
  cachedValue?: string | null;
  providers?: SearchProvider[];
  budgetMs?: number;
  quota?: QuotaStoreLike;
  metricsLogPath?: string;
  tavily?: { enabled?: boolean; trigger?: TavilyTrigger };
  tavilyMonthlyQuota?: QuotaStoreLike;
}

interface CachedSearchValue {
  engines: 'both' | 'single';
  providers: ProviderId[];
  results: SearchResultItem[];
}

function parseCachedValue(raw: string | null | undefined): CachedSearchValue | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedSearchValue;
    return Array.isArray(parsed.results) && (parsed.engines === 'both' || parsed.engines === 'single')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function dedupe(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  const out: SearchResultItem[] = [];
  for (const item of items) {
    const key = item.url || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function runSearchStage(
  query: string,
  opts: SearchStageOptions,
): Promise<SearchStageResult> {
  const start = Date.now();
  const quota = opts.quota ?? new FileQuotaStore(joinDataPath());
  const tavilyMonthlyQuota =
    opts.tavilyMonthlyQuota ?? new FileMonthlyQuotaStore(joinDataPathMonthly());
  const baseProviders = opts.providers ?? [bochaProvider, anysearchProvider];
  const useTavily = opts.tavily?.enabled === true && Boolean(opts.tavily.trigger);
  const providers =
    useTavily && !opts.providers ? [...baseProviders, tavilyProvider] : baseProviders;
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;

  const cached = parseCachedValue(opts.cachedValue ?? getCache(opts.cacheKey ?? ''));
  if (cached) {
    logSearchRequest({
      ts: new Date().toISOString(),
      query,
      bocha_ms: null,
      bocha_ok: false,
      anysearch_ms: null,
      anysearch_ok: false,
      timeout: false,
      degraded: false,
      cacheEngines: cached.engines,
    }, opts.metricsLogPath);
    return {
      results: cached.results,
      attempts: [],
      cacheHit: true,
      cacheEngines: cached.engines,
      degraded: false,
      elapsedMs: Date.now() - start,
      aiAnswers: [],
    };
  }

  const limits: Record<ProviderId, number> = {
    bocha: BOCHA_DAILY_LIMIT,
    anysearch: ANYSEARCH_DAILY_LIMIT,
    tavily: 0, // v0.2a 启用月配额 [P-64] 后替换
  };

  const attempts: SearchAttempt[] = [];
  let collected: SearchProviderResult[] = [];
  const aiAnswers: string[] = [];
  const allSettled = Promise.allSettled(
    providers.map(async (provider) => {
      const attemptStart = Date.now();
      const allowed =
        provider.id === 'tavily'
          ? await tavilyMonthlyQuota.take('tavily', TAVILY_MONTHLY_LIMIT)
          : await quota.take(provider.id, limits[provider.id]);
      if (!allowed) {
        attempts.push({
          provider: provider.id,
          ok: false,
          latencyMs: Date.now() - attemptStart,
          error: '日配额已用尽',
          quotaSkipped: true,
        });
        return;
      }
      try {
        const result = await provider.search(query);
        attempts.push({
          provider: result.provider,
          ok: result.ok,
          latencyMs: result.latencyMs,
          error: result.error,
        });
        if (result.ok) collected.push(result);
        if (result.ok && result.answer) aiAnswers.push(result.answer);
      } catch (err) {
        attempts.push({
          provider: provider.id,
          ok: false,
          latencyMs: Date.now() - attemptStart,
          error: (err as Error).message,
        });
      }
    }),
  );

  const timeoutRace = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), budgetMs);
  });
  const outcome = await Promise.race([allSettled.then(() => 'done' as const), timeoutRace]);
  const timedOut = outcome === 'timeout';

  const results = dedupe(collected.flatMap((r) => r.results));
  const okProviders = attempts.filter((a) => a.ok).map((a) => a.provider);
  const engines: 'both' | 'single' | null =
    okProviders.length >= 2 ? 'both' : okProviders.length === 1 ? 'single' : null;
  if (opts.cacheKey && results.length > 0) {
    const cachedValue: CachedSearchValue = {
      engines: engines ?? 'single',
      providers: okProviders,
      results,
    };
    setCache(opts.cacheKey, JSON.stringify(cachedValue), ttlForIntent(opts.intent));
  }

  const degraded = timedOut || results.length === 0;
  const bochaAttempt = attempts.find((a) => a.provider === 'bocha');
  const anyAttempt = attempts.find((a) => a.provider === 'anysearch');
  logSearchRequest({
    ts: new Date().toISOString(),
    query,
    bocha_ms: bochaAttempt && !bochaAttempt.quotaSkipped ? bochaAttempt.latencyMs : null,
    bocha_ok: bochaAttempt?.ok ?? false,
    anysearch_ms: anyAttempt && !anyAttempt.quotaSkipped ? anyAttempt.latencyMs : null,
    anysearch_ok: anyAttempt?.ok ?? false,
    timeout: timedOut,
    degraded,
    cacheEngines: engines ?? undefined,
  }, opts.metricsLogPath);
  return {
    results,
    attempts,
    cacheHit: false,
    cacheEngines: engines,
    degraded,
    elapsedMs: Date.now() - start,
    aiAnswers,
  };
}

function joinDataPath(): string {
  return join(process.cwd(), 'data', 'search-quota.json');
}

function joinDataPathMonthly(): string {
  return join(process.cwd(), 'data', 'tavily-monthly.json');
}
