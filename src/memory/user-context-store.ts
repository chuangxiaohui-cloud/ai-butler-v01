/**
 * UserContextStore（Week 4）
 * 独立 SQLite 存储：user_profile / user_facts / session_summaries；
 * 衰减/归档复用 confidence-decay 共享模块，不复制实现。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

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
import {
  inferProfessionFromSoftware,
  normalizeSoftwareNames,
} from './software-profile.js';
import {
  classifyPersonaMemory,
  memoryConflictKey,
  type PersonaMemoryKind,
  type PersonaMemoryLayer,
  type PersonaMemoryScope,
} from './persona-memory.js';
import {
  classifyTimeSensitiveMemory,
  isTimeSensitiveMemoryStale,
  timeSensitiveMemoryExpiresAt,
  type TimeSensitiveMemoryKind,
} from './time-sensitive-memory.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_profile (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT '',
  role_source TEXT NOT NULL DEFAULT 'manual',
  installed_software TEXT NOT NULL DEFAULT '[]',
  suggested_role TEXT NOT NULL DEFAULT '',
  current_projects TEXT NOT NULL DEFAULT '[]',
  reply_style TEXT NOT NULL DEFAULT 'secretary',
  tone TEXT NOT NULL DEFAULT 'professional',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  fact_kind TEXT NOT NULL DEFAULT 'general',
  memory_layer TEXT NOT NULL DEFAULT 'L1',
  fact_scope TEXT NOT NULL DEFAULT 'global',
  conflict_key TEXT NOT NULL DEFAULT '',
  temporal_kind TEXT NOT NULL DEFAULT '',
  expires_at INTEGER,
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
  roleSource: 'manual',
  installedSoftware: [],
  suggestedRole: '',
  currentProjects: [],
  preferences: {
    replyStyle: 'secretary',
    tone: 'professional',
  },
};

type UserProfileInput = Pick<UserProfile, 'role' | 'currentProjects' | 'preferences'> &
  Partial<Pick<UserProfile, 'roleSource' | 'installedSoftware' | 'suggestedRole'>>;

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
  fact_kind: string;
  memory_layer: string;
  fact_scope: string;
  conflict_key: string;
  temporal_kind: string;
  expires_at: number | null;
  source: string;
  confidence: number;
  created_at: number;
  last_accessed_at: number;
  review_count: number;
  archived: number;
}

export class UserContextStore {
  private readonly db: DatabaseSync;
  // P11：热路径语句构造器预编译复用，避免每次 prepare
  private readonly addSessionSummaryStmt: StatementSync;
  private readonly archiveStmt: StatementSync;

  constructor(dbPath = join(process.cwd(), 'data', 'user-context.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
    );
    this.db.exec(SCHEMA_SQL);
    this.ensureProfileColumns();
    this.ensureFactColumns();
    this.addSessionSummaryStmt = this.db.prepare(
      `INSERT INTO session_summaries (user_id, session_id, summary, topics, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    this.archiveStmt = this.db.prepare('UPDATE user_facts SET archived = 1 WHERE id = ?');
  }

  close(): void {
    this.db.close();
  }

  load(userId: string, now = Date.now(), scope?: PersonaMemoryScope): UserContext {
    return {
      profile: this.loadProfile(userId),
      longTermFacts: this.loadFacts(userId, now, scope),
      recentSessions: this.loadSessions(userId, 5),
    };
  }

  listFacts(userId: string, scope?: PersonaMemoryScope, now = Date.now()): Array<{
    id: number;
    content: string;
    kind: PersonaMemoryKind;
    layer: PersonaMemoryLayer;
    scope: PersonaMemoryScope;
    conflictKey: string;
    temporalKind: TimeSensitiveMemoryKind | null;
    expiresAt: number | null;
    stale: boolean;
    source: string;
    confidence: number;
    createdAt: number;
    lastAccessedAt: number;
  }> {
    const rows = this.db
      .prepare(
        'SELECT * FROM user_facts WHERE user_id = ? AND archived = 0 ORDER BY confidence DESC',
      )
      .all(userId) as unknown as FactRow[];
    return this.filterFactsForScope(rows, scope).map((row) => ({
      id: row.id,
      content: row.content,
      kind: this.readFactKind(row.fact_kind),
      layer: row.memory_layer === 'L2' ? 'L2' : 'L1',
      scope: this.readFactScope(row.fact_scope),
      conflictKey: row.conflict_key,
      temporalKind: this.readTemporalKind(row.temporal_kind),
      expiresAt: row.expires_at,
      stale: isTimeSensitiveMemoryStale(row.expires_at, now),
      source: row.source,
      confidence: row.confidence,
      createdAt: row.created_at,
      lastAccessedAt: row.last_accessed_at,
    }));
  }

  deleteFact(userId: string, id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM user_facts WHERE user_id = ? AND id = ?')
      .run(userId, id);
    return result.changes > 0;
  }

  listSessions(userId: string, limit = 50): SessionSummary[] {
    return this.loadSessions(userId, limit);
  }

  saveProfile(userId: string, profile: UserProfileInput, now = Date.now()): void {
    const current = this.loadProfile(userId);
    this.writeProfile(userId, {
      ...current,
      ...profile,
      roleSource: 'manual',
      installedSoftware: profile.installedSoftware ?? current.installedSoftware,
      suggestedRole: profile.suggestedRole ?? current.suggestedRole,
    }, now);
  }

  syncInstalledSoftware(
    userId: string,
    software: string[],
    now = Date.now(),
  ): { profile: UserProfile; suggestedRole: string; roleUpdated: boolean } {
    const current = this.loadProfile(userId);
    const installedSoftware = normalizeSoftwareNames(software);
    const suggestedRole = inferProfessionFromSoftware(installedSoftware);
    const roleUpdated = current.roleSource === 'software' || current.role === '';
    const profile: UserProfile = {
      ...current,
      installedSoftware,
      suggestedRole,
      role: roleUpdated ? suggestedRole : current.role,
      roleSource: roleUpdated ? 'software' : 'manual',
    };
    this.writeProfile(userId, profile, now);
    return { profile, suggestedRole, roleUpdated };
  }

  private writeProfile(userId: string, profile: UserProfile, now: number): void {
    this.db
      .prepare(
        `INSERT INTO user_profile
           (user_id, role, role_source, installed_software, suggested_role,
            current_projects, reply_style, tone, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           role = excluded.role,
           role_source = excluded.role_source,
           installed_software = excluded.installed_software,
           suggested_role = excluded.suggested_role,
           current_projects = excluded.current_projects,
           reply_style = excluded.reply_style,
           tone = excluded.tone,
           updated_at = excluded.updated_at`,
      )
      .run(
        userId,
        profile.role,
        profile.roleSource,
        JSON.stringify(profile.installedSoftware),
        profile.suggestedRole,
        JSON.stringify(profile.currentProjects),
        profile.preferences.replyStyle,
        profile.preferences.tone,
        now,
      );
  }

  private ensureProfileColumns(): void {
    const rows = this.db.prepare('PRAGMA table_info(user_profile)').all() as Array<{ name: string }>;
    const columns = new Set(rows.map((row) => row.name));
    if (!columns.has('role_source')) {
      this.db.exec("ALTER TABLE user_profile ADD COLUMN role_source TEXT NOT NULL DEFAULT 'manual'");
    }
    if (!columns.has('installed_software')) {
      this.db.exec("ALTER TABLE user_profile ADD COLUMN installed_software TEXT NOT NULL DEFAULT '[]'");
    }
    if (!columns.has('suggested_role')) {
      this.db.exec("ALTER TABLE user_profile ADD COLUMN suggested_role TEXT NOT NULL DEFAULT ''");
    }
  }

  private ensureFactColumns(): void {
    const rows = this.db.prepare('PRAGMA table_info(user_facts)').all() as Array<{ name: string }>;
    const columns = new Set(rows.map((row) => row.name));
    if (!columns.has('fact_kind')) {
      this.db.exec("ALTER TABLE user_facts ADD COLUMN fact_kind TEXT NOT NULL DEFAULT 'general'");
    }
    if (!columns.has('memory_layer')) {
      this.db.exec("ALTER TABLE user_facts ADD COLUMN memory_layer TEXT NOT NULL DEFAULT 'L1'");
    }
    if (!columns.has('fact_scope')) {
      this.db.exec("ALTER TABLE user_facts ADD COLUMN fact_scope TEXT NOT NULL DEFAULT 'global'");
    }
    if (!columns.has('conflict_key')) {
      this.db.exec("ALTER TABLE user_facts ADD COLUMN conflict_key TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.has('temporal_kind')) {
      this.db.exec("ALTER TABLE user_facts ADD COLUMN temporal_kind TEXT NOT NULL DEFAULT ''");
    }
    if (!columns.has('expires_at')) {
      this.db.exec('ALTER TABLE user_facts ADD COLUMN expires_at INTEGER');
    }
    const legacyRows = this.db
      .prepare(
        "SELECT id, content, created_at FROM user_facts WHERE temporal_kind = '' AND expires_at IS NULL",
      )
      .all() as unknown as Array<{ id: number; content: string; created_at: number }>;
    const backfill = this.db.prepare(
      'UPDATE user_facts SET temporal_kind = ?, expires_at = ? WHERE id = ?',
    );
    for (const row of legacyRows) {
      const kind = classifyTimeSensitiveMemory(row.content);
      if (kind) backfill.run(kind, timeSensitiveMemoryExpiresAt(kind, row.created_at), row.id);
    }
  }

  private readFactKind(value: string): PersonaMemoryKind {
    if (
      value === 'terminology' ||
      value === 'language_preference' ||
      value === 'technical_preference'
    ) {
      return value;
    }
    return 'general';
  }

  private readFactScope(value: string): PersonaMemoryScope {
    if (value === 'engineering' || value === 'knowledge' || value === 'life') return value;
    return 'global';
  }

  private readTemporalKind(value: string): TimeSensitiveMemoryKind | null {
    if (value === 'inventory' || value === 'price' || value === 'version' || value === 'schedule') {
      return value;
    }
    return null;
  }

  private filterFactsForScope(rows: FactRow[], scope?: PersonaMemoryScope): FactRow[] {
    if (!scope || scope === 'global') return rows;
    const visible = rows
      .filter((row) => row.fact_scope === 'global' || row.fact_scope === scope)
      .sort((a, b) => {
        const aCurrent = a.fact_scope === scope ? 1 : 0;
        const bCurrent = b.fact_scope === scope ? 1 : 0;
        return bCurrent - aCurrent || b.confidence - a.confidence;
      });
    const seen = new Set<string>();
    return visible.filter((row) => {
      if (!row.conflict_key) return true;
      if (seen.has(row.conflict_key)) return false;
      seen.add(row.conflict_key);
      return true;
    });
  }

  addFact(
    userId: string,
    content: string,
    source: FactSource,
    now = Date.now(),
    confidence?: number,
    scope: PersonaMemoryScope = 'global',
  ): void {
    const initialConfidence = confidence ?? DEFAULT_FACT_CONFIDENCE[source] ?? 0.6;
    const classification = classifyPersonaMemory(content);
    const conflictKey = memoryConflictKey(content);
    const temporalKind = classifyTimeSensitiveMemory(content);
    const expiresAt = timeSensitiveMemoryExpiresAt(temporalKind, now);
    if (conflictKey) {
      this.db
        .prepare(
          `UPDATE user_facts SET archived = 1
           WHERE user_id = ? AND fact_scope = ? AND conflict_key = ? AND content <> ?`,
        )
        .run(userId, scope, conflictKey, content);
    }
    this.db
      .prepare(
        `INSERT INTO user_facts
           (user_id, content, fact_kind, memory_layer, fact_scope, conflict_key, temporal_kind,
            expires_at, source, confidence,
            created_at, last_accessed_at, review_count, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
         ON CONFLICT(user_id, content) DO UPDATE SET
          fact_kind = excluded.fact_kind,
          memory_layer = excluded.memory_layer,
          conflict_key = excluded.conflict_key,
          temporal_kind = excluded.temporal_kind,
          expires_at = excluded.expires_at,
          last_accessed_at = excluded.last_accessed_at,
          archived = 0`,
      )
      .run(
        userId,
        content,
        classification.kind,
        classification.layer,
        scope,
        conflictKey,
        temporalKind ?? '',
        expiresAt,
        source,
        initialConfidence,
        now,
        now,
      );
  }

  correctMemoryFact(
    userId: string,
    oldContent: string,
    newContent: string,
    now = Date.now(),
    scope: PersonaMemoryScope = 'global',
  ): void {
    const existing = this.db
      .prepare('SELECT * FROM user_facts WHERE user_id = ? AND content = ?')
      .get(userId, oldContent) as FactRow | undefined;
    if (existing) {
      const confidence = Math.min(1, existing.confidence + 0.3);
      const classification = classifyPersonaMemory(newContent);
      const conflictKey = memoryConflictKey(newContent);
      const temporalKind = classifyTimeSensitiveMemory(newContent);
      const expiresAt = timeSensitiveMemoryExpiresAt(temporalKind, now);
      this.db
        .prepare(
          `UPDATE user_facts
           SET content = ?, source = 'corrected', confidence = ?, created_at = ?,
               last_accessed_at = ?, fact_kind = ?, memory_layer = ?, conflict_key = ?,
               temporal_kind = ?, expires_at = ?,
               review_count = review_count + 1, archived = 0
           WHERE user_id = ? AND content = ?`,
        )
        .run(
          newContent,
          confidence,
          now,
          now,
          classification.kind,
          classification.layer,
          conflictKey,
          temporalKind ?? '',
          expiresAt,
          userId,
          oldContent,
        );
      return;
    }
    const classification = classifyPersonaMemory(newContent);
    const conflictKey = memoryConflictKey(newContent);
    const temporalKind = classifyTimeSensitiveMemory(newContent);
    const expiresAt = timeSensitiveMemoryExpiresAt(temporalKind, now);
    this.db
      .prepare(
        `INSERT INTO user_facts
           (user_id, content, fact_kind, memory_layer, fact_scope, conflict_key, temporal_kind,
            expires_at, source, confidence,
            created_at, last_accessed_at, review_count, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'corrected', ?, ?, ?, 1, 0)`,
      )
      .run(
        userId,
        newContent,
        classification.kind,
        classification.layer,
        scope,
        conflictKey,
        temporalKind ?? '',
        expiresAt,
        DEFAULT_FACT_CONFIDENCE.corrected,
        now,
        now,
      );
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
    this.addSessionSummaryStmt.run(userId, sessionId, summary, JSON.stringify(topics), now);
  }

  archiveExpired(userId: string, now = Date.now()): number {
    const rows = this.db
      .prepare(
        'SELECT * FROM user_facts WHERE user_id = ? AND archived = 0',
      )
      .all(userId) as unknown as FactRow[];
    let archivedCount = 0;
    // P11：逐行 UPDATE 包一次事务（否则每行一次 fsync）
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        const days = Math.max(0, (now - row.last_accessed_at) / DAY_MS);
        const confidence = decayedConfidence(
          row.confidence,
          days,
          row.source as FactSource,
        );
        if (shouldArchive(confidence)) {
          this.archiveStmt.run(row.id);
          archivedCount += 1;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return archivedCount;
  }

  private loadProfile(userId: string): UserProfile {
    const row = this.db
      .prepare('SELECT * FROM user_profile WHERE user_id = ?')
      .get(userId) as
      | {
          role: string;
          role_source: string;
          installed_software: string;
          suggested_role: string;
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
      roleSource: row.role_source === 'software' ? 'software' : 'manual',
      installedSoftware: parseJsonArray(row.installed_software),
      suggestedRole: row.suggested_role,
      currentProjects: parseJsonArray(row.current_projects),
      preferences: { replyStyle, tone },
    };
  }

  private loadFacts(
    userId: string,
    now: number,
    scope?: PersonaMemoryScope,
  ): MemoryFact[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM user_facts WHERE user_id = ? AND archived = 0 ORDER BY confidence DESC',
      )
      .all(userId) as unknown as FactRow[];
    return this.filterFactsForScope(rows, scope).map((row) => {
      const days = Math.max(0, (now - row.last_accessed_at) / DAY_MS);
      return {
        content: row.content,
        kind: this.readFactKind(row.fact_kind),
        layer: row.memory_layer === 'L2' ? 'L2' : 'L1',
        scope: this.readFactScope(row.fact_scope),
        conflictKey: row.conflict_key,
        temporalKind: this.readTemporalKind(row.temporal_kind),
        expiresAt: row.expires_at,
        stale: isTimeSensitiveMemoryStale(row.expires_at, now),
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
