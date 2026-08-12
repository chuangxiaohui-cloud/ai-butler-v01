-- v0.1 schema v1（冻结）
-- L0：原始问答，JSONL 格式追加存储
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

-- L1：用户点赞后提炼的记忆
CREATE TABLE IF NOT EXISTS l1_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags TEXT NOT NULL, -- JSON array
  source_l0_ids TEXT NOT NULL, -- JSON array of l0_memory.id
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_l0_session ON l0_memory(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_l1_session ON l1_memory(session_id, timestamp);
