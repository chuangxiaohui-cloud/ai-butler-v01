import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createGithubApiCache, SqliteGithubApiCache } from './cache.js';

function makeCache(now?: () => number): { cache: SqliteGithubApiCache; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gh-cache-'));
  const cache = new SqliteGithubApiCache({ dbPath: join(dir, 'cache.db'), now });
  return { cache, dir };
}

function cleanup(cache: SqliteGithubApiCache, dir: string): void {
  try {
    cache.close();
  } catch {
    // 已关闭忽略
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows 下 WAL 文件偶发锁残留，清理失败不阻塞断言
  }
}

test('github-api-cache: miss → null，set 后同 URL 命中', () => {
  const { cache, dir } = makeCache();
  try {
    const url = 'https://api.github.com/repos/openclaw/openclaw';
    assert.equal(cache.get(url), null);
    cache.set(url, '{"stars":1}', 300_000);
    assert.equal(cache.get(url), '{"stars":1}');
  } finally {
    cleanup(cache, dir);
  }
});

test('github-api-cache: TTL 过期后 miss 且惰性删除', () => {
  let now = 1_000_000;
  const { cache, dir } = makeCache(() => now);
  try {
    const url = 'https://api.github.com/repos/openclaw/openclaw';
    cache.set(url, '{"stars":1}', 300_000);
    now += 299_999;
    assert.ok(cache.get(url), 'TTL 内应命中');
    now += 2; // 越过 TTL
    assert.equal(cache.get(url), null, '过期应 miss');
  } finally {
    cleanup(cache, dir);
  }
});

test('github-api-cache: 覆盖写更新 body 与 fetched_at', () => {
  let now = 1_000_000;
  const { cache, dir } = makeCache(() => now);
  try {
    const url = 'https://api.github.com/repos/openclaw/openclaw';
    cache.set(url, '{"stars":1}', 300_000);
    now += 1_000;
    cache.set(url, '{"stars":2}', 300_000);
    assert.equal(cache.get(url), '{"stars":2}');
  } finally {
    cleanup(cache, dir);
  }
});

test('github-api-cache: createGithubApiCache 为单例（路径随 GITHUB_CACHE_DB_PATH）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gh-cache-singleton-'));
  const old = process.env.GITHUB_CACHE_DB_PATH;
  process.env.GITHUB_CACHE_DB_PATH = join(dir, 'cache.db');
  try {
    const a = createGithubApiCache();
    const b = createGithubApiCache();
    assert.equal(a, b, '应返回同一实例');
  } finally {
    if (old === undefined) delete process.env.GITHUB_CACHE_DB_PATH;
    else process.env.GITHUB_CACHE_DB_PATH = old;
    try {
      rmSync(dirname(join(dir, 'cache.db')), { recursive: true, force: true });
    } catch {
      // Windows 文件锁残留忽略
    }
  }
});