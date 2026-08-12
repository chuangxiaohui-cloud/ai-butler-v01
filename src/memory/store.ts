/**
 * MemoryStore 接口 + SqliteDirectStore（v0.1 占位）
 * 对齐 §8.4 schema v1，v0.2b 可切换为 MemoryCoreStore 而不改接口
 */

export interface MemoryRecord {
  session_id: string;
  query: string;
  answer: string;
  confidence: number;
  evidence_hash: string;
  timestamp: number;
}

export interface MemoryStore {
  put(record: MemoryRecord): Promise<void>;
  recall(sessionId: string, limit?: number): Promise<MemoryRecord[]>;
  forget(sessionId: string): Promise<void>;
}

export class SqliteDirectStore implements MemoryStore {
  async put(_record: MemoryRecord): Promise<void> {
    // WP8 实现
  }

  async recall(_sessionId: string, _limit = 10): Promise<MemoryRecord[]> {
    // WP8 实现
    return [];
  }

  async forget(_sessionId: string): Promise<void> {
    // WP8 实现
  }
}
