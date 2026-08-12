/**
 * MemoryStore 接口 + SqliteDirectStore（§8.4）
 * 对齐 §8.4 schema v1，v0.2b 可切换为 MemoryCoreStore 而不改接口
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

export interface MemoryRecord {
  session_id: string;
  query: string;
  answer: string;
  confidence: number;
  evidence_hash: string;
  timestamp: number;
}

export interface MemoryStore {
  put(record: MemoryRecord): Promise<string>;
  recall(sessionId: string, limit?: number): Promise<MemoryRecord[]>;
  forget(sessionId: string): Promise<void>;
}

// 与 src/memory/schema.sql（冻结）保持一致；内嵌副本避免 dist 运行时丢失。
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS l0_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  query TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_hash TEXT NOT NULL,
  raw_jsonl TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS l1_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT NOT NULL,
  source_l0_ids TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_l0_session ON l0_memory(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_l1_session ON l1_memory(session_id, timestamp);
`;

export class SqliteDirectStore implements MemoryStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = join(process.cwd(), 'data', 'memory.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  async put(record: MemoryRecord): Promise<string> {
    const rawJsonl = JSON.stringify(record);
    const result = this.db
      .prepare(
        `INSERT INTO l0_memory
           (session_id, query, answer, confidence, evidence_hash, raw_jsonl, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.session_id,
        record.query,
        record.answer,
        record.confidence,
        record.evidence_hash,
        rawJsonl,
        record.timestamp,
      );
    return String(result.lastInsertRowid);
  }

  async recall(sessionId: string, limit = 10): Promise<MemoryRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM l0_memory WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(sessionId, limit) as Array<{
      id: number;
      session_id: string;
      query: string;
      answer: string;
      confidence: number;
      evidence_hash: string;
      raw_jsonl: string;
      timestamp: number;
    }>;
    return rows.map((row) => ({
      session_id: row.session_id,
      query: row.query,
      answer: row.answer,
      confidence: row.confidence,
      evidence_hash: row.evidence_hash,
      timestamp: row.timestamp,
    }));
  }

  async forget(sessionId: string): Promise<void> {
    this.db.prepare('DELETE FROM l0_memory WHERE session_id = ?').run(sessionId);
  }
}

let defaultStore: SqliteDirectStore | null = null;

export function defaultMemoryStore(): SqliteDirectStore {
  if (!defaultStore) defaultStore = new SqliteDirectStore();
  return defaultStore;
}
