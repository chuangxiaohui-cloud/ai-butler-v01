/**
 * ExperienceManager（§12.3，v0.2b WP4）
 * 经验检索（关键词/BM25 兜底）+ 置信度演化 + 衰减 + 冷存。
 * 无向量时语义检索退化为关键词匹配；embedding 接入后扩展 search 实现。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { isColdAfter, weeklyDecayConfidence } from './confidence-decay.js';

const P30_DECAY_PER_WEEK = 0.9; // [P-30]
const P31_COLD_DAYS = 90; // [P-31]
const P32_CONFIDENCE_MIN = 0.5; // [P-32]
const P72_UP_STEP = 0.05; // [P-72]
const P19_DOWN_STEP = 0.1; // [P-19]
const P79_REVIEW_THRESHOLD = 3; // [P-79]

export interface ExperienceEntry {
  id: string;
  skillName: string;
  content: string;
  keywords: string[];
  usageCount: number;
  thumbsDownCount: number;
  consecutiveDown: number;
  confidence: number;
  createdAt: number;
  lastUsedAt: number | null;
  needsReview: boolean;
}

export interface ExperienceSearchOptions {
  limit?: number;
  now?: number;
}

export class ExperienceManager {
  private readonly db: DatabaseSync;
  // P11：热路径 recordUse 语句构造器预编译复用
  private readonly recordUseStmt: StatementSync;

  constructor(dbPath = join(process.cwd(), 'data', 'experience.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experiences (
        id TEXT PRIMARY KEY,
        skill_name TEXT NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        thumbs_down_count INTEGER NOT NULL DEFAULT 0,
        consecutive_down INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        needs_review INTEGER NOT NULL DEFAULT 0
      );
    `);
    this.recordUseStmt = this.db.prepare(
      `UPDATE experiences
       SET usage_count = usage_count + 1, confidence = ?, last_used_at = ?, consecutive_down = 0
       WHERE id = ?`,
    );
  }

  close(): void {
    this.db.close();
  }

  add(entry: Omit<ExperienceEntry, 'usageCount' | 'thumbsDownCount' | 'consecutiveDown' | 'confidence' | 'needsReview'>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO experiences
           (id, skill_name, content, keywords, usage_count, thumbs_down_count, consecutive_down,
            confidence, created_at, last_used_at, needs_review)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0.5, ?, ?, 0)`,
      )
      .run(entry.id, entry.skillName, entry.content, entry.keywords.join(','), entry.createdAt, entry.lastUsedAt);
  }

  list(now = Date.now()): ExperienceEntry[] {
    return this.all().map((entry) => this.decayEntry(entry, now));
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM experiences WHERE id = ?').run(id);
    return result.changes > 0;
  }

  recordUse(id: string, now = Date.now()): void {
    const row = this.get(id);
    if (!row) return;
    const decayed = this.decayConfidence(row, now);
    const confidence = Math.min(1, decayed + 0.02); // 使用次数提升置信度
    this.recordUseStmt.run(confidence, now, id);
  }

  recordFeedback(id: string, up: boolean, now = Date.now()): void {
    const row = this.get(id);
    if (!row) return;
    const decayed = this.decayConfidence(row, now);
    if (up) {
      const confidence = Math.min(1, decayed + P72_UP_STEP);
      this.db
        .prepare(
          `UPDATE experiences
           SET confidence = ?, thumbs_down_count = thumbs_down_count, consecutive_down = 0, last_used_at = ?
           WHERE id = ?`,
        )
        .run(confidence, now, id);
      return;
    }
    const consecutive = row.consecutiveDown + 1;
    const confidence = Math.max(0, decayed - P19_DOWN_STEP);
    const review = consecutive >= P79_REVIEW_THRESHOLD ? 1 : row.needsReview ? 1 : 0;
    this.db
      .prepare(
        `UPDATE experiences
         SET confidence = ?, thumbs_down_count = thumbs_down_count + 1, consecutive_down = ?,
             needs_review = ?, last_used_at = ?
         WHERE id = ?`,
      )
      .run(confidence, consecutive, review, now, id);
  }

  search(query: string, opts: ExperienceSearchOptions = {}): ExperienceEntry[] {
    const now = opts.now ?? Date.now();
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];
    const rows = this.searchRows(tokens, now);
    const scored = rows
      .map((r) => {
        const text = `${r.content} ${r.keywords.join(' ')}`.toLowerCase();
        const hits = tokens.filter((t) => text.includes(t)).length;
        return { entry: r, hits, score: hits + r.confidence };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 5)
      .map((x) => x.entry);
    return scored.map((r) => this.decayEntry(r, now));
  }

  stats(now = Date.now()): { total: number; active: number; cold: number; review: number } {
    // P12：单趟聚合 COUNT，不再全表载入
    const coldCutoff = now - P31_COLD_DAYS * 24 * 3600 * 1000;
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN (last_used_at IS NOT NULL AND last_used_at >= ?)
                          OR (last_used_at IS NULL AND created_at >= ?) THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN (last_used_at IS NOT NULL AND last_used_at < ?)
                          OR (last_used_at IS NULL AND created_at < ?) THEN 1 ELSE 0 END) AS cold,
                SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS review
         FROM experiences`,
      )
      .get(coldCutoff, coldCutoff, coldCutoff, coldCutoff) as unknown as {
      total: number;
      active: number;
      cold: number;
      review: number;
    };
    return {
      total: row.total,
      active: row.active,
      cold: row.cold,
      review: row.review,
    };
  }

  private get(id: string): ExperienceEntry | null {
    const row = this.db
      .prepare('SELECT * FROM experiences WHERE id = ?')
      .get(id) as unknown as ExperienceRow | undefined;
    return row ? mapRow(row) : null;
  }

  private all(): ExperienceEntry[] {
    const rows = this.db.prepare('SELECT * FROM experiences').all() as unknown as ExperienceRow[];
    return rows.map(mapRow);
  }

  /** P12：候选下推 SQL（review/置信度/冷存/关键词 LIKE），避免每次请求全表载入 */
  private searchRows(tokens: string[], now: number): ExperienceEntry[] {
    const coldCutoff = now - P31_COLD_DAYS * 24 * 3600 * 1000;
    const params: (string | number)[] = [P32_CONFIDENCE_MIN, coldCutoff, coldCutoff];
    const clauses: string[] = [];
    for (const token of tokens) {
      const pattern = `%${escapeLike(token)}%`;
      clauses.push(`content LIKE ? ${LIKE_ESCAPE} OR keywords LIKE ? ${LIKE_ESCAPE}`);
      params.push(pattern, pattern);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM experiences
         WHERE needs_review = 0
           AND confidence >= ?
           AND ((last_used_at IS NOT NULL AND last_used_at >= ?)
                OR (last_used_at IS NULL AND created_at >= ?))
           AND (${clauses.join(' OR ')})`,
      )
      .all(...params) as unknown as ExperienceRow[];
    return rows.map(mapRow);
  }

  private decayConfidence(entry: ExperienceEntry, now: number): number {
    return weeklyDecayConfidence(
      entry.confidence,
      entry.lastUsedAt ?? entry.createdAt,
      now,
      P30_DECAY_PER_WEEK,
    );
  }

  private decayEntry(entry: ExperienceEntry, now: number): ExperienceEntry {
    return { ...entry, confidence: this.decayConfidence(entry, now) };
  }

  private isCold(entry: ExperienceEntry, now: number): boolean {
    return isColdAfter(entry.lastUsedAt ?? entry.createdAt, now, P31_COLD_DAYS);
  }
}

const LIKE_ESCAPE = `ESCAPE '\\'`; // SQLite LIKE 转义符声明，配合 escapeLike 按字面匹配
/** 转义 LIKE 通配符 %/_ 与转义符自身，防查询 token 扩大匹配面（P12） */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

interface ExperienceRow {
  id: string;
  skill_name: string;
  content: string;
  keywords: string;
  usage_count: number;
  thumbs_down_count: number;
  consecutive_down: number;
  confidence: number;
  created_at: number;
  last_used_at: number | null;
  needs_review: number;
}

function mapRow(row: ExperienceRow): ExperienceEntry {
  return {
    id: row.id,
    skillName: row.skill_name,
    content: row.content,
    keywords: row.keywords ? row.keywords.split(',').filter(Boolean) : [],
    usageCount: row.usage_count,
    thumbsDownCount: row.thumbs_down_count,
    consecutiveDown: row.consecutive_down,
    confidence: row.confidence,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    needsReview: row.needs_review === 1,
  };
}
