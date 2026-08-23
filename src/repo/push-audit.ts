/**
 * v1.0 S6：push 审计日志（§11.3/§11.4）
 * 每次 push 写 JSONL 事件日志 data/repo-push-events.jsonl，可追溯。
 * 复用 src/log/jsonl.ts 追加与 [P-113] 轮转；条目不含 token。
 */

import { join } from 'node:path';
import { appendJsonl } from '../log/jsonl.js';
import type { RepoHost } from './types.js';

export interface PushAuditEntry {
  ts: string;
  host: RepoHost;
  owner: string;
  repo: string;
  branch: string;
  commit?: string;
  url?: string;
  ok: boolean;
  conflict?: boolean;
  error?: string;
}

export function logPushEvent(
  entry: Omit<PushAuditEntry, 'ts'>,
  filePath = join(process.cwd(), 'data', 'repo-push-events.jsonl'),
): void {
  appendJsonl(filePath, JSON.stringify({ ts: new Date().toISOString(), ...entry }));
}
