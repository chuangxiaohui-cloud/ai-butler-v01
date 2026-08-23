/**
 * Bocha provider 余额告警单测（E192，mock fetch）
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { resetBochaBalanceCache } from '../balance.js';
import { bochaProvider } from './bocha.js';

process.env.BOCHA_API_KEY = 'unit-test-key';

let cacheFile = '';
function freshCache(): void {
  const dir = mkdtempSync(join(tmpdir(), 'bocha-provider-'));
  cacheFile = join(dir, 'bocha-balance.json');
  process.env.BOCHA_BALANCE_CACHE = cacheFile;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init)) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const WEB_SEARCH = 'https://api.bochaai.com/v1/web-search';

test.afterEach(() => {
  resetBochaBalanceCache();
  rmSync(cacheFile, { recursive: true, force: true });
});

test('bocha: 2xx 正常返回，无 notice', async () => {
  freshCache();
  stubFetch(async (url) => {
    assert.equal(url, WEB_SEARCH);
    return jsonResponse({ data: { webPages: { value: [{ name: 't', url: 'https://e.com', summary: 's' }] } } });
  });
  const r = await bochaProvider.search('q');
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 1);
  assert.equal(r.notice, undefined);
});

test('bocha: HTTP 402 + 余额耗尽 → notice 强告警', async () => {
  freshCache();
  stubFetch(async (url) => {
    if (url.includes('/v1/fund/remaining')) return jsonResponse({ data: { remaining: 0 } });
    return jsonResponse({}, 402);
  });
  const r = await bochaProvider.search('q');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'HTTP 402');
  assert.ok(r.notice && r.notice.includes('已耗尽'));
  // latencyMs 应为 HTTP 请求耗时而非余额探测耗时（度量口径不被探测污染）
  assert.ok(r.latencyMs >= 0 && r.latencyMs < 3000);
});

test('bocha: HTTP 402 + 余额探测失败 → 无 notice 不阻塞', async () => {
  freshCache();
  stubFetch(async (url) => {
    if (url.includes('/v1/fund/remaining')) throw new Error('balance api down');
    return jsonResponse({}, 402);
  });
  const r = await bochaProvider.search('q');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'HTTP 402');
  assert.equal(r.notice, undefined);
});

test('bocha: 未配置 key → 明确报错且不探测余额', async () => {
  freshCache();
  const original = process.env.BOCHA_API_KEY;
  delete process.env.BOCHA_API_KEY;
  try {
    let balanceCalls = 0;
    stubFetch(async (url) => {
      if (url.includes('/v1/fund/remaining')) balanceCalls += 1;
      return jsonResponse({});
    });
    const r = await bochaProvider.search('q');
    assert.equal(r.ok, false);
    assert.equal(r.error, '未配置 BOCHA_API_KEY');
    assert.equal(balanceCalls, 0);
  } finally {
    process.env.BOCHA_API_KEY = original;
  }
});

test('bocha: P4 外部 signal 立即取消 fetch（不等到自身超时）', async () => {
  freshCache();
  let fetchCalled = false;
  stubFetch(async (_url, init) => {
    fetchCalled = true;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 2000);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('This operation was aborted', 'AbortError'));
      }, { once: true });
    });
    return jsonResponse({ data: { webPages: { value: [] } } });
  });
  const controller = new AbortController();
  const p = bochaProvider.search('q', { signal: controller.signal });
  controller.abort();
  const r = await p;
  assert.equal(r.ok, false);
  assert.ok(r.error && /abort/i.test(r.error), `expect abort error, got: ${r.error}`);
  assert.equal(fetchCalled, true, 'fetch 已发起但被外部 signal 中止');
});