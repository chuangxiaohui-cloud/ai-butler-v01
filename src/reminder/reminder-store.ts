/**
 * 主动提醒存储：SQLite reminders 表。
 * gateway 定时轮询到期提醒；E165：重复提醒（daily/weekly）触发后自动顺延下一次，
 * 普通提醒标记 fired 后只推送一次。
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type ReminderRepeat = '' | 'daily' | 'weekly';

export interface Reminder {
  id: number;
  userId: string;
  conversationId: string;
  message: string;
  remindAt: number;
  createdAt: number;
  fired: boolean;
  repeat: ReminderRepeat;
}

export interface AddReminderInput {
  userId: string;
  conversationId?: string;
  message: string;
  remindAt: number;
  repeat?: ReminderRepeat;
}

export function reminderDbPath(): string {
  return process.env.REMINDERS_DB_PATH ?? join(process.cwd(), 'data', 'reminders.db');
}

const REPEAT_MS: Record<Exclude<ReminderRepeat, ''>, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export class ReminderStore {
  private readonly db: DatabaseSync;
  // P11：dueReminders 循环内 reschedule 语句构造器预编译复用
  private readonly rescheduleStmt: StatementSync;

  constructor(dbPath = reminderDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;',
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        remind_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        fired INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(fired, remind_at);
    `);
    try {
      this.db.exec("ALTER TABLE reminders ADD COLUMN repeat TEXT NOT NULL DEFAULT ''");
    } catch {
      // 列已存在则跳过
    }
    this.rescheduleStmt = this.db.prepare('UPDATE reminders SET remind_at = ? WHERE id = ?');
  }

  close(): void {
    this.db.close();
  }

  add(input: AddReminderInput, now = Date.now()): Reminder {
    // E165：重复提醒创建时若首次时间已过，直接顺延到下一个未来时刻，
    // 避免落库后立即补发造成“刚设置就响”的误导
    let remindAt = input.remindAt;
    if (input.repeat) {
      const step = REPEAT_MS[input.repeat] ?? 24 * 60 * 60 * 1000;
      while (remindAt <= now) remindAt += step;
    }
    const result = this.db
      .prepare(
        `INSERT INTO reminders (user_id, conversation_id, message, remind_at, created_at, fired, repeat)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        input.userId,
        input.conversationId ?? '',
        input.message,
        remindAt,
        now,
        input.repeat ?? '',
      );
    return {
      id: Number(result.lastInsertRowid),
      userId: input.userId,
      conversationId: input.conversationId ?? '',
      message: input.message,
      remindAt,
      createdAt: now,
      fired: false,
      repeat: input.repeat ?? '',
    };
  }

  dueReminders(now = Date.now()): Reminder[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM reminders WHERE fired = 0 AND remind_at <= ? ORDER BY remind_at ASC',
      )
      .all(now) as unknown as ReminderRow[];
    if (rows.length === 0) return [];
    const onceIds: number[] = [];
    // P11：逐行顺延/标记 UPDATE 包一次事务（否则每行一次 fsync）
    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        if (row.repeat) {
          // E165：重复提醒顺延到下一个未来时刻，避免离线多日补发刷屏
          const step = REPEAT_MS[row.repeat as Exclude<ReminderRepeat, ''>] ?? 24 * 60 * 60 * 1000;
          let next = row.remind_at;
          while (next <= now) next += step;
          this.rescheduleStmt.run(next, row.id);
        } else {
          onceIds.push(row.id);
        }
      }
      if (onceIds.length > 0) {
        const placeholders = onceIds.map(() => '?').join(',');
        this.db
          .prepare(`UPDATE reminders SET fired = 1 WHERE id IN (${placeholders})`)
          .run(...onceIds);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return rows.map(mapRow).map((r) => ({ ...r, fired: r.remindAt <= now }));
  }

  list(userId: string, now = Date.now()): Reminder[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC',
      )
      .all(userId) as unknown as ReminderRow[];
    return rows.map(mapRow).map((r) => ({ ...r, fired: r.remindAt <= now }));
  }

  /** E163：按 id 取消提醒，返回是否命中 */
  cancel(id: number): boolean {
    const result = this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }
}

interface ReminderRow {
  id: number;
  user_id: string;
  conversation_id: string;
  message: string;
  remind_at: number;
  created_at: number;
  fired: number;
  repeat: string;
}

function mapRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    message: row.message,
    remindAt: row.remind_at,
    createdAt: row.created_at,
    fired: row.fired === 1,
    repeat: (row.repeat === 'daily' || row.repeat === 'weekly' ? row.repeat : '') as ReminderRepeat,
  };
}
