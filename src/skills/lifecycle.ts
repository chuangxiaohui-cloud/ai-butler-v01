/**
 * Skill 生命周期治理（§8.2，v0.2b WP5）
 * 四字段元数据 + 使用/反馈记录 + 冷存 + 特异性优先 + 复审标记。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import { getSkills } from './registry.js';
import { isColdAfter, weeklyDecayConfidence } from '../memory/confidence-decay.js';

const P30_DECAY_PER_WEEK = 0.9; // [P-30]
const P31_COLD_DAYS = 90; // [P-31]
const P32_CONFIDENCE_MIN = 0.5; // [P-32]
const P79_REVIEW_THRESHOLD = 3; // [P-79]

export interface SkillStat {
  name: string;
  version: string;
  usageCount: number;
  thumbsDownCount: number;
  consecutiveDown: number;
  confidence: number;
  lastUsedAt: number | null;
  createdAt: number;
  needsReview: boolean;
}

export class SkillLifecycle {
  private readonly db: DatabaseSync;

  constructor(dbPath = join(process.cwd(), 'data', 'experience.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_stats (
        name TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        thumbs_down_count INTEGER NOT NULL DEFAULT 0,
        consecutive_down INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0.6,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        needs_review INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  ensureRegistered(now = Date.now()): void {
    for (const skill of getSkills()) {
      const existing = this.db.prepare('SELECT name FROM skill_stats WHERE name = ?').get(skill.name);
      if (!existing) {
        this.db
          .prepare(
            `INSERT INTO skill_stats (name, version, usage_count, thumbs_down_count, consecutive_down,
              confidence, last_used_at, created_at, needs_review)
             VALUES (?, ?, 0, 0, 0, 0.6, NULL, ?, 0)`,
          )
          .run(skill.name, skill.version, now);
      }
    }
  }

  recordUse(name: string, now = Date.now()): void {
    const stat = this.get(name);
    if (!stat) return;
    const decayed = this.decayConfidence(stat, now);
    this.db
      .prepare(
        `UPDATE skill_stats
         SET usage_count = usage_count + 1, confidence = ?, last_used_at = ?, consecutive_down = 0
         WHERE name = ?`,
      )
      .run(decayed, now, name);
  }

  recordFeedback(name: string, up: boolean, now = Date.now()): void {
    const stat = this.get(name);
    if (!stat) return;
    const decayed = this.decayConfidence(stat, now);
    if (up) {
      const confidence = Math.min(1, decayed + 0.05); // [P-72]
      this.db
        .prepare(
          `UPDATE skill_stats SET confidence = ?, last_used_at = ?, consecutive_down = 0 WHERE name = ?`,
        )
        .run(confidence, now, name);
      return;
    }
    const consecutive = stat.consecutiveDown + 1;
    const confidence = Math.max(0, decayed - 0.1); // [P-19]
    const review = consecutive >= P79_REVIEW_THRESHOLD ? 1 : stat.needsReview ? 1 : 0;
    this.db
      .prepare(
        `UPDATE skill_stats
         SET confidence = ?, thumbs_down_count = thumbs_down_count + 1, consecutive_down = ?,
             needs_review = ?, last_used_at = ?
         WHERE name = ?`,
      )
      .run(confidence, consecutive, review, now, name);
  }

  list(now = Date.now()): Array<SkillStat & { state: 'active' | 'cold' | 'review' }> {
    const rows = this.all();
    return rows.map((r) => ({
      ...r,
      confidence: this.decayConfidence(r, now),
      state: r.needsReview ? 'review' : this.isCold(r, now) ? 'cold' : 'active',
    }));
  }

  findBest(query: string, now = Date.now()): { name: string; triggerLength: number } | null {
    const lower = query.toLowerCase();
    const candidates = getSkills()
      .map((skill) => {
        const stat = this.get(skill.name);
        if (!stat) return null;
        const decayed = this.decayConfidence(stat, now);
        if (this.isCold(stat, now) || stat.needsReview || decayed < P32_CONFIDENCE_MIN) return null;
        const matched = skill.triggers.filter((t) => lower.includes(t.toLowerCase()));
        if (matched.length === 0) return null;
        return {
          name: skill.name,
          triggerLength: Math.max(...matched.map((t) => t.length)),
        };
      })
      .filter((x): x is { name: string; triggerLength: number } => x !== null)
      .sort((a, b) => b.triggerLength - a.triggerLength);
    return candidates[0] ?? null;
  }

  private get(name: string): SkillStat | null {
    const row = this.db.prepare('SELECT * FROM skill_stats WHERE name = ?').get(name) as
      | SkillRow
      | undefined;
    return row ? mapRow(row) : null;
  }

  private all(): SkillStat[] {
    const rows = this.db.prepare('SELECT * FROM skill_stats').all() as unknown as SkillRow[];
    return rows.map(mapRow);
  }

  private decayConfidence(stat: SkillStat, now: number): number {
    return weeklyDecayConfidence(
      stat.confidence,
      stat.lastUsedAt ?? stat.createdAt,
      now,
      P30_DECAY_PER_WEEK,
    );
  }

  private isCold(stat: SkillStat, now: number): boolean {
    return isColdAfter(stat.lastUsedAt ?? stat.createdAt, now, P31_COLD_DAYS);
  }
}

interface SkillRow {
  name: string;
  version: string;
  usage_count: number;
  thumbs_down_count: number;
  consecutive_down: number;
  confidence: number;
  last_used_at: number | null;
  created_at: number;
  needs_review: number;
}

function mapRow(row: SkillRow): SkillStat {
  return {
    name: row.name,
    version: row.version,
    usageCount: row.usage_count,
    thumbsDownCount: row.thumbs_down_count,
    consecutiveDown: row.consecutive_down,
    confidence: row.confidence,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    needsReview: row.needs_review === 1,
  };
}
