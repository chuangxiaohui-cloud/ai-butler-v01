/**
 * 多源质量闭环（§12.3 经验闭环）
 * 按 源 × 意图 记录调用数、成功数、总耗时，用于判断哪个源在哪个 query 类上效果好。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import type { ProviderId } from './providers/types.js';
import type { IntentKey } from './stages/s2_classify.js';

export interface SourceStatRow {
  source: ProviderId;
  intent: IntentKey;
  calls: number;
  okCalls: number;
  totalMs: number;
}

export class SearchSourceStats {
  private readonly db: DatabaseSync;

  constructor(dbPath = join(process.cwd(), 'data', 'source-stats.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS source_stats (
        source TEXT NOT NULL,
        intent TEXT NOT NULL,
        calls INTEGER NOT NULL DEFAULT 0,
        ok_calls INTEGER NOT NULL DEFAULT 0,
        total_ms INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (source, intent)
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  record(source: ProviderId, intent: IntentKey, ok: boolean, latencyMs: number): void {
    this.db
      .prepare(
        `INSERT INTO source_stats (source, intent, calls, ok_calls, total_ms)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(source, intent) DO UPDATE SET
           calls = calls + 1,
           ok_calls = ok_calls + excluded.ok_calls,
           total_ms = total_ms + excluded.total_ms`,
      )
      .run(source, intent, ok ? 1 : 0, Math.max(0, Math.round(latencyMs)));
  }

  summary(): SourceStatRow[] {
    const rows = this.db.prepare('SELECT * FROM source_stats ORDER BY source, intent').all() as unknown as Array<{
      source: ProviderId;
      intent: IntentKey;
      calls: number;
      ok_calls: number;
      total_ms: number;
    }>;
    return rows.map((r) => ({
      source: r.source,
      intent: r.intent,
      calls: r.calls,
      okCalls: r.ok_calls,
      totalMs: r.total_ms,
    }));
  }
}
