/**
 * github-reader L1 抓取 HTTP 缓存（E284）
 * 只缓存 GitHub API JSON（repo/contributors/commits/releases），TTL 由 [P-142] 决定；
 * raw README/manifest 不走缓存（内容敏感，短保真优先）。
 * 基于 node:sqlite DatabaseSync（与 UserContextStore 同款），按 URL 精确键，过期条目惰性删除。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

import type { HttpCacheLike } from '../deps.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS http_cache (
  url TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  ttl_ms INTEGER NOT NULL
);
`;

export interface GithubApiCacheOptions {
  /** SQLite 路径（默认 GITHUB_CACHE_DB_PATH 或 data/github-api-cache.db） */
  dbPath?: string;
  /** 测试注入：时间源，TTL 过期判定据此计算 */
  now?: () => number;
}

export class SqliteGithubApiCache implements HttpCacheLike {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly getStmt: StatementSync;
  private readonly setStmt: StatementSync;
  private readonly deleteStmt: StatementSync;

  constructor(options: GithubApiCacheOptions = {}) {
    const dbPath =
      options.dbPath ??
      process.env.GITHUB_CACHE_DB_PATH ??
      join(process.cwd(), 'data', 'github-api-cache.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
    );
    this.db.exec(SCHEMA_SQL);
    this.now = options.now ?? Date.now;
    // 热路径语句预编译复用，避免每次 prepare
    this.getStmt = this.db.prepare(
      'SELECT body, fetched_at, ttl_ms FROM http_cache WHERE url = ?',
    );
    this.setStmt = this.db.prepare(
      `INSERT INTO http_cache (url, body, fetched_at, ttl_ms) VALUES (?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, ttl_ms = excluded.ttl_ms`,
    );
    this.deleteStmt = this.db.prepare('DELETE FROM http_cache WHERE url = ?');
  }

  get(url: string): string | null {
    const row = this.getStmt.get(url) as
      | { body: string; fetched_at: number; ttl_ms: number }
      | undefined;
    if (!row) return null;
    if (this.now() - row.fetched_at > row.ttl_ms) {
      // 过期条目在命中时惰性删除（不额外维护清扫任务）
      this.deleteStmt.run(url);
      return null;
    }
    return row.body;
  }

  set(url: string, body: string, ttlMs: number): void {
    this.setStmt.run(url, body, this.now(), ttlMs);
  }

  close(): void {
    this.db.close();
  }
}

let cacheSingleton: HttpCacheLike | null = null;

/** 生产单例：首次调用时打开 data/github-api-cache.db（main/gateway/im 共用同一份缓存） */
export function createGithubApiCache(): HttpCacheLike {
  if (!cacheSingleton) cacheSingleton = new SqliteGithubApiCache();
  return cacheSingleton;
}
