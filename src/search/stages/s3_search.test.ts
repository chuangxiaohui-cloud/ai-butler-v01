import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { clearCacheForTests, getCache, setCache } from '../cache.js';
import { readSearchMetrics } from '../metrics.js';
import type { QuotaStoreLike } from '../quota.js';
import type {
  ProviderId,
  SearchProvider,
  SearchProviderResult,
  SearchResultItem,
} from '../providers/types.js';
import { runSearchStage } from './s3_search.js';

process.env.SEARCH_METRICS_LOG = join(tmpdir(), 's3-search-metrics-test.jsonl');

class FakeProvider implements SearchProvider {
  constructor(
    readonly id: ProviderId,
    private readonly outcome: 'ok' | 'error' | 'timeout',
    private readonly items: SearchResultItem[] = [],
    private readonly answer?: string,
  ) {}

  async search(query: string): Promise<SearchProviderResult> {
    if (this.outcome === 'error') {
      return {
        provider: this.id,
        ok: false,
        results: [],
        latencyMs: 1,
        error: 'boom',
      };
    }
    if (this.outcome === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error('timeout');
    }
    return {
      provider: this.id,
      ok: this.items.length > 0,
      results: this.items,
      latencyMs: 1,
      answer: this.answer,
    };
  }
}

const okBocha = new FakeProvider('bocha', 'ok', [
  { title: 'b1', url: 'https://example.com/1', content: 'c1', provider: 'bocha' },
]);
const okAny = new FakeProvider('anysearch', 'ok', [
  { title: 'a1', url: 'https://example.com/2', content: 'c2', provider: 'anysearch' },
  { title: 'dup', url: 'https://example.com/1', content: 'dup', provider: 'anysearch' },
]);

class FakeQuota implements QuotaStoreLike {
  constructor(private readonly blocked: Set<string> = new Set()) {}

  async take(key: string): Promise<boolean> {
    return !this.blocked.has(key);
  }
}

test('s3: 双引擎成功并跨引擎去重', async () => {
  clearCacheForTests();
  const r = await runSearchStage('q', {
    intent: 'factual',
    providers: [okBocha, okAny],
    quota: new FakeQuota(),
  });
  assert.equal(r.results.length, 2);
  assert.equal(r.degraded, false);
  assert.equal(r.cacheHit, false);
  assert.equal(r.attempts.length, 2);
  assert.ok(r.attempts.every((a) => a.ok));
});

test('s3: 单路超时由另一路兜底', async () => {
  clearCacheForTests();
  const r = await runSearchStage('q', {
    intent: 'factual',
    providers: [new FakeProvider('bocha', 'timeout'), okAny],
    quota: new FakeQuota(),
    budgetMs: 200,
  });
  assert.equal(r.results.length, 2);
  assert.equal(r.degraded, false);
  assert.equal(r.attempts.filter((a) => a.provider === 'anysearch').length, 1);
});

test('s3: 双路失败时缓存命中兜底', async () => {
  clearCacheForTests();
  setCache(
    'search:k',
    JSON.stringify({
      engines: 'single',
      providers: ['bocha'],
      results: [{ title: 'cached', url: 'https://cached.example/1', content: 'c', provider: 'bocha' }],
    }),
    60_000,
  );
  const r = await runSearchStage('q', {
    intent: 'factual',
    cacheKey: 'search:k',
    providers: [new FakeProvider('bocha', 'error'), new FakeProvider('anysearch', 'error')],
    quota: new FakeQuota(),
  });
  assert.equal(r.cacheHit, true);
  assert.equal(r.results.length, 1);
  assert.equal(r.cacheEngines, 'single');
  assert.equal(r.degraded, false);
  clearCacheForTests();
});

test('s3: 配额用尽的路跳过，不阻塞另一路', async () => {
  clearCacheForTests();
  const r = await runSearchStage('q', {
    intent: 'factual',
    providers: [okBocha, okAny],
    quota: new FakeQuota(new Set(['bocha'])),
  });
  assert.equal(r.attempts.find((a) => a.provider === 'bocha')?.quotaSkipped, true);
  assert.equal(r.results.length, 2);
  assert.equal(r.degraded, false);
  const metrics = readSearchMetrics();
  assert.equal(metrics[metrics.length - 1]?.bocha_quota_skipped, true);
});

test('s3: 双路超时且无缓存 → degraded 无结果', async () => {
  clearCacheForTests();
  const r = await runSearchStage('q', {
    intent: 'factual',
    providers: [
      new FakeProvider('bocha', 'timeout'),
      new FakeProvider('anysearch', 'timeout'),
    ],
    quota: new FakeQuota(),
    budgetMs: 200,
  });
  assert.equal(r.results.length, 0);
  assert.equal(r.degraded, true);
  assert.equal(r.attempts.filter((a) => !a.ok).length, 2);
});

test('s3: 双路配额耗尽 → 全部 skip 且 degraded', async () => {
  clearCacheForTests();
  const r = await runSearchStage('q', {
    intent: 'factual',
    providers: [okBocha, okAny],
    quota: new FakeQuota(new Set(['bocha', 'anysearch'])),
  });
  assert.equal(r.attempts.every((a) => a.quotaSkipped), true);
  assert.equal(r.results.length, 0);
  assert.equal(r.degraded, true);
});

test('s3: 有结果时写入缓存供后续命中', async () => {
  clearCacheForTests();
  await runSearchStage('q', {
    intent: 'experience',
    cacheKey: 'search:ttl',
    providers: [okBocha, okAny],
    quota: new FakeQuota(),
  });
  const cached = getCache('search:ttl');
  assert.ok(cached);
  assert.ok(cached.includes('example.com'));
  const parsed = JSON.parse(cached) as { engines: string; results: unknown[] };
  assert.equal(parsed.engines, 'both');
  assert.ok(Array.isArray(parsed.results));
  clearCacheForTests();
});

test('s3: 单引擎结果缓存标记 single', async () => {
  clearCacheForTests();
  await runSearchStage('q', {
    intent: 'factual',
    cacheKey: 'search:single',
    providers: [okBocha],
    quota: new FakeQuota(),
  });
  const cached = getCache('search:single');
  assert.ok(cached);
  const parsed = JSON.parse(cached) as { engines: string; results: unknown[] };
  assert.equal(parsed.engines, 'single');
  assert.ok(Array.isArray(parsed.results));
  clearCacheForTests();
});

test('s3: tavily 触发并联并收集 AI Answer', async () => {
  clearCacheForTests();
  const tavilyFake = new FakeProvider(
    'tavily',
    'ok',
    [{ title: 't', url: 'https://tavily.example/1', content: 'c', provider: 'tavily' }],
    'AI Answer 高置信软事实',
  );
  const r = await runSearchStage('q', {
    intent: 'news',
    providers: [okBocha, okAny],
    quota: new FakeQuota(),
    tavilyMonthlyQuota: new FakeQuota(),
    tavily: { enabled: true, trigger: 'news' },
  });
  // 默认 providers 是 [bocha, anysearch]，tavily 需要注入才有实际 provider
  const r2 = await runSearchStage('q', {
    intent: 'news',
    providers: [okBocha, okAny, tavilyFake],
    quota: new FakeQuota(),
    tavilyMonthlyQuota: new FakeQuota(),
    tavily: { enabled: true, trigger: 'news' },
  });
  assert.equal(r2.aiAnswers.length, 1);
  assert.equal(r2.aiAnswers[0], 'AI Answer 高置信软事实');
  assert.equal(r2.attempts.some((a) => a.provider === 'tavily'), true);
  assert.equal(r.aiAnswers.length, 0);
  clearCacheForTests();
});

test('s3: tavily 月配额用尽则跳过', async () => {
  clearCacheForTests();
  const tavilyFake = new FakeProvider(
    'tavily',
    'ok',
    [{ title: 't', url: 'https://tavily.example/1', content: 'c', provider: 'tavily' }],
    'AI Answer',
  );
  const r = await runSearchStage('q', {
    intent: 'news',
    providers: [okBocha, okAny, tavilyFake],
    quota: new FakeQuota(),
    tavilyMonthlyQuota: new FakeQuota(new Set(['tavily'])),
    tavily: { enabled: true, trigger: 'news' },
  });
  const tavilyAttempt = r.attempts.find((a) => a.provider === 'tavily');
  assert.equal(tavilyAttempt?.quotaSkipped, true);
  assert.equal(r.aiAnswers.length, 0);
  clearCacheForTests();
});
