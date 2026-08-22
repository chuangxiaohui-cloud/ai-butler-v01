/**
 * Bocha 余额探测与告警单测（E192，mock fetch）
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  bochaBalanceWarning,
  describeBochaBalance,
  queryBochaBalance,
  resetBochaBalanceCache,
} from './balance.js';

process.env.BOCHA_API_KEY = 'unit-test-key';

let cacheDir = '';
function freshCacheDir(): string {
  cacheDir = mkdtempSync(join(tmpdir(), 'bocha-balance-'));
  const file = join(cacheDir, 'bocha-balance.json');
  process.env.BOCHA_BALANCE_CACHE = file;
  return file;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init)) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test.afterEach(() => {
  resetBochaBalanceCache();
  rmSync(cacheDir, { recursive: true, force: true });
});

test('balance: 成功解析 remaining 并折算剩余次数（[P-75]）', async () => {
  freshCacheDir();
  let calls = 0;
  stubFetch(async () => {
    calls += 1;
    return jsonResponse({ success: true, data: { remaining: 2.8 } });
  });
  const snap = await queryBochaBalance({ force: true });
  assert.ok(snap);
  assert.equal(snap.remainingYuan, 2.8);
  assert.equal(snap.remainingCalls, Math.floor(2.8 / 0.0036));
  assert.equal(snap.remainingCalls, 777);
  assert.ok(Number.isFinite(Date.parse(snap.fetchedAt)));
  assert.equal(calls, 1); // 主 host 成功即返回，不再探测备 host
});

test('balance: 主 host 失败时回退备 host', async () => {
  freshCacheDir();
  stubFetch(async (url) => {
    if (url.includes('api.bocha.cn')) return jsonResponse({}, 500);
    return jsonResponse({ data: { remaining: 1.5 } });
  });
  const snap = await queryBochaBalance({ force: true });
  assert.ok(snap);
  assert.equal(snap.remainingYuan, 1.5);
  assert.equal(snap.remainingCalls, 416);
});

test('balance: 全部 host 失败静默返回 null', async () => {
  freshCacheDir();
  stubFetch(async () => {
    throw new Error('network down');
  });
  const snap = await queryBochaBalance({ force: true });
  assert.equal(snap, null);
});

test('balance: 未配置 key 返回 null', async () => {
  freshCacheDir();
  const original = process.env.BOCHA_API_KEY;
  delete process.env.BOCHA_API_KEY;
  try {
    let called = false;
    stubFetch(async () => {
      called = true;
      return jsonResponse({ data: { remaining: 1 } });
    });
    const snap = await queryBochaBalance({ force: true });
    assert.equal(snap, null);
    assert.equal(called, false);
  } finally {
    process.env.BOCHA_API_KEY = original;
  }
});

test('balance: 冷却期内复用内存缓存不重复请求', async () => {
  freshCacheDir();
  let calls = 0;
  stubFetch(async () => {
    calls += 1;
    return jsonResponse({ data: { remaining: 2.8 } });
  });
  const first = await queryBochaBalance({ force: true });
  const second = await queryBochaBalance();
  assert.ok(first && second);
  assert.equal(second.remainingYuan, first.remainingYuan);
  assert.equal(calls, 1); // 第二次调用命中内存缓存，不再发请求
});

test('balance: force 绕过冷却重新探测', async () => {
  freshCacheDir();
  let calls = 0;
  stubFetch(async () => {
    calls += 1;
    return jsonResponse({ data: { remaining: 2.8 } });
  });
  await queryBochaBalance({ force: true });
  await queryBochaBalance({ force: true });
  assert.ok(calls >= 2);
});

test('balance: 新鲜持久缓存免网络探测', async () => {
  freshCacheDir();
  const file = process.env.BOCHA_BALANCE_CACHE!;
  writeFileSync(
    file,
    JSON.stringify({ remainingYuan: 2.8, remainingCalls: 777, fetchedAt: new Date().toISOString() }),
    'utf-8',
  );
  let calls = 0;
  stubFetch(async () => {
    calls += 1;
    return jsonResponse({ data: { remaining: 2.8 } });
  });
  const snap = await queryBochaBalance();
  assert.ok(snap);
  assert.equal(snap.remainingCalls, 777);
  assert.equal(calls, 0);
});

test('balance: 告警文案——耗尽强告警 / [P-67] 低余量 / 健康', () => {
  assert.ok(bochaBalanceWarning({ remainingYuan: 0, remainingCalls: 0, fetchedAt: '' })!.includes('已耗尽'));
  assert.ok(bochaBalanceWarning({ remainingYuan: 0.028, remainingCalls: 7, fetchedAt: '' })!.includes('[P-67]'));
  assert.equal(bochaBalanceWarning({ remainingYuan: 2.8, remainingCalls: 777, fetchedAt: '' }), null);
  assert.ok(describeBochaBalance({ remainingYuan: 2.8, remainingCalls: 777, fetchedAt: '' }).includes('777'));
});
