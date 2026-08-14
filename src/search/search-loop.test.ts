import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { SearchProvider, SearchProviderResult, SearchResultItem } from './providers/types.js';
import { runSearchLoop } from './search-loop.js';

process.env.SEARCH_METRICS_LOG = join(tmpdir(), 'search-loop-metrics-test.jsonl');

class FakeProvider implements SearchProvider {
  readonly id = 'bocha' as const;

  async search(query: string): Promise<SearchProviderResult> {
    const item: SearchResultItem = {
      title: `title-${query}`,
      url: `https://example.com/${encodeURIComponent(query)}`,
      content: `content-${query}`,
      provider: 'bocha',
    };
    return { provider: 'bocha', ok: true, results: [item], latencyMs: 1 };
  }
}

class FakeQuota implements QuotaStoreLike {
  async take(): Promise<boolean> {
    return true;
  }
}

class FakeOfficialProvider implements SearchProvider {
  readonly id = 'tavily' as const;

  async search(): Promise<SearchProviderResult> {
    return {
      provider: 'tavily',
      ok: true,
      results: [
        {
          title: 'STM32F103C8T6 Datasheet',
          url: 'https://www.st.com/en/microcontrollers-microprocessors/stm32f103c8.html',
          content: 'STM32F103C8T6 maximum frequency 72 MHz',
          provider: 'tavily',
        },
      ],
      latencyMs: 1,
    };
  }
}

class FakeLLM implements LLMClient {
  private judgeCalls = 0;

  async complete(messages: ChatMessage[]): Promise<string> {
    const system = messages[0]?.content ?? '';
    if (system.includes('检索查询改写器')) {
      return JSON.stringify({ queries: ['q1', 'q2'] });
    }
    this.judgeCalls += 1;
    if (this.judgeCalls === 1) {
      return JSON.stringify({ enough: false, moreQueries: ['q3'] });
    }
    if (this.judgeCalls === 2) {
      return JSON.stringify({ enough: false });
    }
    return JSON.stringify({ enough: true });
  }
}

test('search-loop: 无 LLM 时单次子搜索', async () => {
  const r = await runSearchLoop('q', {
    intent: 'factual',
    providers: [new FakeProvider()],
    quota: new FakeQuota(),
    minResults: 1,
  });
  assert.deepEqual(r.subQueries, ['q']);
  assert.equal(r.results.length, 1);
  assert.equal(r.degraded, false);
});

test('search-loop: LLM 追加子查询直到覆盖足够', async () => {
  const records: Array<{ source: string; intent: string; ok: boolean; latencyMs: number }> = [];
  const r = await runSearchLoop('q', {
    intent: 'factual',
    providers: [new FakeProvider()],
    quota: new FakeQuota(),
    llm: new FakeLLM(),
    minResults: 3,
    maxSubSearches: 4,
    sourceStats: {
      record(source, intent, ok, latencyMs) {
        records.push({ source, intent, ok, latencyMs });
      },
    },
  });
  assert.ok(r.subQueries.includes('q1'));
  assert.ok(r.subQueries.includes('q2'));
  assert.ok(r.subQueries.includes('q3'));
  assert.ok(r.results.length >= 3);
  assert.ok(records.length >= 3);
  assert.ok(records.every((x) => x.source === 'bocha'));
});

test('search-loop: 器件查询自动拉取官方域兜底', async () => {
  const r = await runSearchLoop('STM32F103C8T6 最大主频是多少', {
    intent: 'factual',
    providers: [new FakeProvider()],
    quota: new FakeQuota(),
    tavily: { enabled: true },
    tavilyMonthlyQuota: new FakeQuota(),
    officialProvider: new FakeOfficialProvider(),
    minResults: 1,
  });
  assert.ok(r.results.some((x) => x.url.includes('st.com')));
  assert.ok(r.attempts.some((a) => a.provider === 'tavily' && a.ok));
});
