/**
 * ExperienceManager（§12.3，v0.2b WP4）
 * 经验检索（关键词/BM25 兜底）+ 置信度演化 + 衰减 + 冷存。
 * 无向量时语义检索退化为关键词匹配；embedding 接入后扩展 search 实现。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

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

  constructor(dbPath = join(process.cwd(), 'data', 'experience.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
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

  recordUse(id: string, now = Date.now()): void {
    const row = this.get(id);
    if (!row) return;
    const decayed = this.decayConfidence(row, now);
    const confidence = Math.min(1, decayed + 0.02); // 使用次数提升置信度
    this.db
      .prepare(
        `UPDATE experiences
         SET usage_count = usage_count + 1, confidence = ?, last_used_at = ?, consecutive_down = 0
         WHERE id = ?`,
      )
      .run(confidence, now, id);
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
    const rows = this.all();
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    const scored = rows
      .filter((r) => !r.needsReview)
      .filter((r) => !this.isCold(r, now))
      .filter((r) => r.confidence >= P32_CONFIDENCE_MIN)
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
    const rows = this.all();
    return {
      total: rows.length,
      active: rows.filter((r) => !this.isCold(r, now)).length,
      cold: rows.filter((r) => this.isCold(r, now)).length,
      review: rows.filter((r) => r.needsReview).length,
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

  private decayConfidence(entry: ExperienceEntry, now: number): number {
    const last = entry.lastUsedAt ?? entry.createdAt;
    const weeks = Math.max(0, (now - last) / (7 * 24 * 3600 * 1000));
    return Math.max(0.1, entry.confidence * Math.pow(P30_DECAY_PER_WEEK, weeks));
  }

  private decayEntry(entry: ExperienceEntry, now: number): ExperienceEntry {
    return { ...entry, confidence: this.decayConfidence(entry, now) };
  }

  private isCold(entry: ExperienceEntry, now: number): boolean {
    const last = entry.lastUsedAt ?? entry.createdAt;
    return now - last > P31_COLD_DAYS * 24 * 3600 * 1000;
  }
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
