import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  fetchTavilyUsage,
  TAVILY_USAGE_ENDPOINT,
  type UsageFetchLike,
} from './tavily-usage.js';

function mockFetch(status: number, body: unknown): UsageFetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const FULL_BODY = {
  key: {
    usage: 1000,
    limit: null,
    search_usage: 1000,
    crawl_usage: 0,
    extract_usage: 0,
    map_usage: 0,
    research_usage: 0,
  },
  account: { current_plan: 'Researcher' },
};

test('tavily-usage: 未配置 key 返回 ok:false 且不发起请求', async () => {
  let called = false;
  const snap = await fetchTavilyUsage({
    apiKey: '',
    fetchImpl: async () => {
      called = true;
      return { ok: true, status: 200, json: async () => FULL_BODY };
    },
  });
  assert.equal(snap.ok, false);
  assert.match(snap.error ?? '', /TAVILY_API_KEY/);
  assert.equal(called, false);
});

test('tavily-usage: HTTP 非 2xx 返回 ok:false 与状态码', async () => {
  const snap = await fetchTavilyUsage({ apiKey: 'k', fetchImpl: mockFetch(401, {}) });
  assert.equal(snap.ok, false);
  assert.equal(snap.error, 'HTTP 401');
});

test('tavily-usage: 200 完整字段解析（Bearer 头）', async () => {
  let sentHeaders: Record<string, string> | undefined;
  const snap = await fetchTavilyUsage({
    apiKey: 'secret-key',
    fetchImpl: async (url, init) => {
      assert.equal(url, TAVILY_USAGE_ENDPOINT);
      sentHeaders = init?.headers;
      return { ok: true, status: 200, json: async () => FULL_BODY };
    },
  });
  assert.equal(snap.ok, true);
  assert.equal(sentHeaders?.Authorization, 'Bearer secret-key');
  assert.equal(snap.usage, 1000);
  assert.equal(snap.limit, null);
  assert.equal(snap.searchUsage, 1000);
  assert.equal(snap.crawlUsage, 0);
  assert.equal(snap.plan, 'Researcher');
  assert.ok(snap.latencyMs >= 0);
});

test('tavily-usage: 200 部分字段缺省按 0/null 兜底', async () => {
  const snap = await fetchTavilyUsage({ apiKey: 'k', fetchImpl: mockFetch(200, {}) });
  assert.equal(snap.ok, true);
  assert.equal(snap.usage, 0);
  assert.equal(snap.limit, null);
  assert.equal(snap.searchUsage, 0);
  assert.equal(snap.plan, undefined);
});

test('tavily-usage: fetch 抛异常返回 ok:false 并保留消息', async () => {
  const snap = await fetchTavilyUsage({
    apiKey: 'k',
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(snap.ok, false);
  assert.equal(snap.error, 'network down');
});
