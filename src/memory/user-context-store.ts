/**
 * UserContextStore（Week 4）
 * 独立 SQLite 存储：user_profile / user_facts / session_summaries；
 * 衰减/归档复用 confidence-decay 共享模块，不复制实现。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import {
  DAY_MS,
  decayedConfidence,
  shouldArchive,
  type FactSource,
} from './confidence-decay.js';
import type {
  MemoryFact,
  SessionSummary,
  UserContext,
  UserProfile,
} from './user-context.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT '',
  current_projects TEXT NOT NULL DEFAULT '[]',
  reply_style TEXT NOT NULL DEFAULT 'secretary',
  tone TEXT NOT NULL DEFAULT 'professional',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, content)
);

CREATE TABLE IF NOT EXISTS session_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_facts ON user_facts(user_id, archived, confidence);
CREATE INDEX IF NOT EXISTS idx_session_summaries ON session_summaries(user_id, created_at DESC);
`;

const DEFAULT_FACT_CONFIDENCE: Record<FactSource, number> = {
  user_explicit: 0.9,
  inferred: 0.6,
  corrected: 0.95,
};

const DEFAULT_PROFILE: UserProfile = {
  role: '',
  currentProjects: [],
  preferences: {
    replyStyle: 'secretary',
    tone: 'professional',
  },
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface FactRow {
  id: number;
  user_id: string;
  content: string;
  source: string;
  confidence: number;
  created_at: number;
  last_accessed_at: number;
  review_count: number;
  archived: number;
}

export class UserContextStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = join(process.cwd(), 'data', 'user-context.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  load(userId: string, now = Date.now()): UserContext {
    return {
      profile: this.loadProfile(userId),
      longTermFacts: this.loadFacts(userId, now),
      recentSessions: this.loadSessions(userId, 5),
    };
  }

  saveProfile(userId: string, profile: UserProfile, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO user_profile (user_id, role, current_projects, reply_style, tone, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           role = excluded.role,
           current_projects = excluded.current_projects,
           reply_style = excluded.reply_style,
           tone = excluded.tone,
           updated_at = excluded.updated_at`,
      )
      .run(
        userId,
        profile.role,
        JSON.stringify(profile.currentProjects),
        profile.preferences.replyStyle,
        profile.preferences.tone,
        now,
      );
  }

  addFact(
    userId: string,
    content: string,
    source: FactSource,
    now = Date.now(),
    confidence?: number,
  ): void {
    const initialConfidence = confidence ?? DEFAULT_FACT_CONFIDENCE[source] ?? 0.6;
    this.db
      .prepare(
        `INSERT INTO user_facts
           (user_id, content, source, confidence, created_at, last_accessed_at, review_count, archived)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0)
         ON CONFLICT(user_id, content) DO UPDATE SET
          last_accessed_at = excluded.last_accessed_at`,
      )
      .run(userId, content, source, initialConfidence, now, now);
  }

  correctMemoryFact(
    userId: string,
    oldContent: string,
    newContent: string,
    now = Date.now(),
  ): void {
    const existing = this.db
      .prepare('SELECT * FROM user_facts WHERE user_id = ? AND content = ?')
      .get(userId, oldContent) as FactRow | undefined;
    if (existing) {
      const confidence = Math.min(1, existing.confidence + 0.3);
      this.db
        .prepare(
          `UPDATE user_facts
           SET content = ?, source = 'corrected', confidence = ?, created_at = ?,
               last_accessed_at = ?, review_count = review_count + 1, archived = 0
           WHERE user_id = ? AND content = ?`,
        )
        .run(newContent, confidence, now, now, userId, oldContent);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO user_facts
           (user_id, content, source, confidence, created_at, last_accessed_at, review_count, archived)
         VALUES (?, ?, 'corrected', ?, ?, ?, 1, 0)`,
      )
      .run(userId, newContent, DEFAULT_FACT_CONFIDENCE.corrected, now, now);
  }

  recordFactAccess(userId: string, content: string, now = Date.now()): void {
    this.db
      .prepare(
        'UPDATE user_facts SET last_accessed_at = ? WHERE user_id = ? AND content = ?',
      )
      .run(now, userId, content);
  }

  addSessionSummary(
    userId: string,
    sessionId: string,
    summary: string,
    topics: string[],
    now = Date.now(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO session_summaries (user_id, session_id, summary, topics, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(userId, sessionId, summary, JSON.stringify(topics), now);
  }

  archiveExpired(userId: string, now = Date.now()): number {
    const rows = this.db
      .prepare(
        'SELECT * FROM user_facts WHERE user_id = ? AND archived = 0',
      )
      .all(userId) as unknown as FactRow[];
    let archivedCount = 0;
    const archiveStmt = this.db.prepare(
      'UPDATE user_facts SET archived = 1 WHERE id = ?',
    );
    for (const row of rows) {
      const days = Math.max(0, (now - row.last_accessed_at) / DAY_MS);
      const confidence = decayedConfidence(
        row.confidence,
        days,
        row.source as FactSource,
      );
      if (shouldArchive(confidence)) {
        archiveStmt.run(row.id);
        archivedCount += 1;
      }
    }
    return archivedCount;
  }

  private loadProfile(userId: string): UserProfile {
    const row = this.db
      .prepare('SELECT * FROM user_profile WHERE user_id = ?')
      .get(userId) as
      | {
          role: string;
          current_projects: string;
          reply_style: string;
          tone: string;
        }
      | undefined;
    if (!row) return { ...DEFAULT_PROFILE, currentProjects: [] };
    const replyStyle =
      row.reply_style === 'concise' || row.reply_style === 'detailed' || row.reply_style === 'secretary'
        ? row.reply_style
        : 'secretary';
    const tone =
      row.tone === 'professional' || row.tone === 'casual' || row.tone === 'humorous'
        ? row.tone
        : 'professional';
    return {
      role: row.role,
      currentProjects: parseJsonArray(row.current_projects),
      preferences: { replyStyle, tone },
    };
  }

  private loadFacts(userId: string, now: number): MemoryFact[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM user_facts WHERE user_id = ? AND archived = 0 ORDER BY confidence DESC',
      )
      .all(userId) as unknown as FactRow[];
    return rows.map((row) => {
      const days = Math.max(0, (now - row.last_accessed_at) / DAY_MS);
      return {
        content: row.content,
        source: row.source as FactSource,
        confidence: decayedConfidence(row.confidence, days, row.source as FactSource),
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
        reviewCount: row.review_count,
      };
    });
  }

  private loadSessions(userId: string, limit: number): SessionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM session_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(userId, limit) as unknown as Array<{
      session_id: string;
      summary: string;
      topics: string;
      created_at: number;
    }>;
    return rows.map((row) => ({
      sessionId: row.session_id,
      summary: row.summary,
      topics: parseJsonArray(row.topics),
      createdAt: row.created_at,
    }));
  }
}
