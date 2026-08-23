/**
 * v1.0 S6：仓库白名单（§11.4 白名单）
 * 默认只 push 用户确认过的仓库；新增仓库需显式 authorize。
 * JSONL 落盘 data/repo-whitelist.jsonl（复用 src/log/jsonl.ts 追加与缓存读），
 * revoke 原子重写（先关句柄再 rename，Windows 下 rename 覆盖打开的文件会失败）。
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appendJsonl, closeJsonl, readJsonlCached } from '../log/jsonl.js';
import type { RepoHost, RepoIdentity } from './types.js';

export function repoKey(repo: RepoIdentity): string {
  return `${repo.host}/${repo.owner}/${repo.name}`;
}

function parseWhitelistLine(line: string): RepoIdentity | null {
  try {
    const parsed = JSON.parse(line) as { repo?: RepoIdentity };
    const repo = parsed?.repo;
    if (!repo || typeof repo.host !== 'string' || typeof repo.owner !== 'string' || typeof repo.name !== 'string') {
      return null;
    }
    return { host: repo.host as RepoHost, owner: repo.owner, name: repo.name };
  } catch {
    return null; // 损坏行忽略，不阻塞读取
  }
}

export class RepoWhitelist {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), 'data', 'repo-whitelist.jsonl')) {
    this.filePath = filePath;
  }

  isAuthorized(repo: RepoIdentity): boolean {
    const key = repoKey(repo);
    return this.list().some((entry) => repoKey(entry) === key);
  }

  /** 显式授权（幂等：已授权不重复追加） */
  authorize(repo: RepoIdentity): void {
    if (this.isAuthorized(repo)) return;
    appendJsonl(this.filePath, JSON.stringify({ ts: new Date().toISOString(), repo }));
  }

  /** 收回授权（只移除目标仓库，不影响其他） */
  revoke(repo: RepoIdentity): void {
    const key = repoKey(repo);
    const kept = this.list().filter((entry) => repoKey(entry) !== key);
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      closeJsonl(this.filePath);
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, kept.map((entry) => JSON.stringify({ ts: new Date().toISOString(), repo: entry })).join('\n'), 'utf-8');
      renameSync(tmp, this.filePath);
    } catch {
      // 落盘失败不阻塞本次会话内判定
    }
  }

  list(): RepoIdentity[] {
    return readJsonlCached<RepoIdentity>(this.filePath, parseWhitelistLine);
  }
}
