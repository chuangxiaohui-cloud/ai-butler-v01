import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { clearCacheForTests } from './cache.js';
import type { ChatMessage, LLMClient } from './llm.js';
import type { QuotaStoreLike } from './quota.js';
import type { SearchProvider, SearchProviderResult, SearchResultItem } from './providers/types.js';
import { runSearchLoop } from './search-loop.js';

process.env.SEARCH_METRICS_LOG = join(tmpdir(), 'search-loop-metrics-test.jsonl');

test.beforeEach(() => {
  clearCacheForTests();
});

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

class FakeDomesticProvider implements SearchProvider {
  readonly id = 'bocha' as const;

  async search(query: string): Promise<SearchProviderResult> {
    const item: SearchResultItem = {
      title: 'STM32F103C8T6 数据手册',
      url: 'https://item.szlcsc.com/515651.html',
      content: '72MHz LQFP48',
      provider: 'bocha',
    };
    return { provider: 'bocha', ok: true, results: [item], latencyMs: 1 };
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

test('search-loop: 已有立创商城结果时不重复消耗 Tavily', async () => {
  const r = await runSearchLoop('STM32F103C8T6 立创商城数据手册', {
    intent: 'factual',
    providers: [new FakeDomesticProvider()],
    quota: new FakeQuota(),
    tavily: { enabled: true },
    tavilyMonthlyQuota: new FakeQuota(),
    officialProvider: new FakeOfficialProvider(),
    minResults: 1,
  });
  assert.ok(r.results.some((x) => x.url.includes('szlcsc.com')));
  assert.ok(!r.attempts.some((a) => a.provider === 'tavily'));
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

test('search-loop: 无高可信源时浏览器会话兜底并跳过 Tavily', async () => {
  const browser = {
    calls: [] as string[],
    async fetchPage(url: string, _timeoutMs?: number) {
      this.calls.push(url);
      return {
        url: 'https://www.st.com/en/microcontrollers-microprocessors/stm32f103c8.html',
        title: 'STM32F103C8T6 Datasheet',
        text: '72MHz maximum frequency LQFP48',
      };
    },
  };
  const r = await runSearchLoop('STM32F103C8T6 最大主频是多少', {
    intent: 'factual',
    providers: [new FakeProvider()],
    quota: new FakeQuota(),
    tavily: { enabled: true },
    tavilyMonthlyQuota: new FakeQuota(),
    officialProvider: new FakeOfficialProvider(),
    browserSession: browser,
    minResults: 1,
  });
  assert.ok(browser.calls.length > 0);
  assert.ok(r.results.some((x) => x.url.includes('st.com')));
  assert.ok(r.attempts.some((a) => a.provider === 'browser' && a.ok));
  assert.ok(!r.attempts.some((a) => a.provider === 'tavily'));
});

test('search-loop: 浏览器兜底失败后仍走 Tavily 官方域', async () => {
  const browser = {
    async fetchPage() {
      throw new Error('browser offline');
    },
  };
  const r = await runSearchLoop('STM32F103C8T6 最大主频是多少', {
    intent: 'factual',
    providers: [new FakeProvider()],
    quota: new FakeQuota(),
    tavily: { enabled: true },
    tavilyMonthlyQuota: new FakeQuota(),
    officialProvider: new FakeOfficialProvider(),
    browserSession: browser,
    minResults: 1,
  });
  assert.ok(r.attempts.some((a) => a.provider === 'browser' && !a.ok));
  assert.ok(r.attempts.some((a) => a.provider === 'tavily' && a.ok));
});

test('search-loop: 已有高可信源但证据不足时浏览器补证并跳过 Tavily', async () => {
  const browser = {
    calls: [] as string[],
    async fetchPage(url: string, _timeoutMs?: number) {
      this.calls.push(url);
      return {
        url: 'https://item.szlcsc.com/datasheet/GD32F103C8T6/79128.html',
        title: 'GD32F103C8T6 数据手册',
        text: 'GD32F103C8T6 完整数据手册，包含电气特性、引脚定义、存储器映射',
      };
    },
  };
  const r = await runSearchLoop('GD32F103C8T6 数据手册', {
    intent: 'factual',
    providers: [new FakeDomesticProvider()],
    quota: new FakeQuota(),
    tavily: { enabled: true },
    tavilyMonthlyQuota: new FakeQuota(),
    officialProvider: new FakeOfficialProvider(),
    browserSession: browser,
    minResults: 2,
    maxSubSearches: 1,
  });
  assert.ok(browser.calls.length > 0);
  assert.ok(r.results.length >= 2);
  assert.ok(r.results.every((x) => x.url.includes('szlcsc.com')));
  assert.ok(!r.attempts.some((a) => a.provider === 'tavily'));
});
