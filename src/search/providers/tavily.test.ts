import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { tavilyProvider } from './tavily.js';

test('tavily: news 意图请求携带新闻检索参数', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return {
      ok: true,
      json: async () => ({ results: [], answer: 'x' }),
    } as Response;
  }) as typeof fetch;

  try {
    await tavilyProvider.search('世界杯战报', { topic: 'news', days: 30 });
    assert.equal(requestBody.topic, 'news');
    assert.equal(requestBody.days, 30);
    assert.equal(requestBody.search_depth, 'advanced');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TAVILY_API_KEY;
  }
});

test('tavily: include_domains 限定官方域', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return {
      ok: true,
      json: async () => ({ results: [], answer: 'x' }),
    } as Response;
  }) as typeof fetch;

  try {
    await tavilyProvider.search('STM32F103C8T6 datasheet', {
      includeDomains: ['st.com'],
    });
    assert.deepEqual(requestBody.include_domains, ['st.com']);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TAVILY_API_KEY;
  }
});

test('tavily: HTTP 432 计划用量超限 → error + notice', async () => {
  process.env.TAVILY_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return { ok: false, status: 432 } as Response;
  }) as typeof fetch;
  try {
    const r = await tavilyProvider.search('STM32');
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', /432/);
    assert.match(r.notice ?? '', /超限/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TAVILY_API_KEY;
  }
});
