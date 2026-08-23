/**
 * v1.0 S7：市场 Skill 安装记录（§8.2.3 卸载保留记录，可追溯）
 * JSONL 落盘 data/skill-market-installs.jsonl（复用 src/log/jsonl.ts 追加/轮转/缓存读）。
 * 状态为 append-only：最新一条同名记录决定当前状态（installed/disabled）。
 */

import { join } from 'node:path';
import { appendJsonl, readJsonlCached } from '../../log/jsonl.js';
import type { MarketInstallRecord, MarketInstallStatus } from './types.js';

function parseRecordLine(line: string): MarketInstallRecord | null {
  try {
    const record = JSON.parse(line) as MarketInstallRecord;
    if (typeof record.name !== 'string' || typeof record.version !== 'string') return null;
    if (typeof record.sourceUrl !== 'string' || typeof record.checksum !== 'string') return null;
    if (record.status !== 'installed' && record.status !== 'disabled') return null;
    if (!Array.isArray(record.permissions)) return null;
    return record;
  } catch {
    return null; // 损坏行忽略
  }
}

export class MarketStore {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), 'data', 'skill-market-installs.jsonl')) {
    this.filePath = filePath;
  }

  record(record: MarketInstallRecord): void {
    appendJsonl(this.filePath, JSON.stringify(record));
  }

  list(): MarketInstallRecord[] {
    return readJsonlCached<MarketInstallRecord>(this.filePath, parseRecordLine);
  }

  /** 同名最近一条记录（append-only，最新状态生效） */
  latest(name: string): MarketInstallRecord | null {
    const records = this.list().filter((record) => record.name === name);
    return records[records.length - 1] ?? null;
  }

  statusOf(name: string): MarketInstallStatus | 'unknown' {
    return this.latest(name)?.status ?? 'unknown';
  }

  /** 当前已安装（最新状态为 installed）的记录 */
  installed(): MarketInstallRecord[] {
    const latestBy: Map<string, MarketInstallRecord> = new Map();
    for (const record of this.list()) {
      latestBy.set(record.name, record);
    }
    return [...latestBy.values()].filter((record) => record.status === 'installed');
  }

  /** 卸载标记：追加 disabled 记录，保留历史（不静默删除，§8.2.2 冷存不删） */
  markDisabled(name: string): void {
    const latest = this.latest(name);
    if (!latest || latest.status !== 'installed') return;
    this.record({ ...latest, status: 'disabled', ts: new Date().toISOString() });
  }
}
