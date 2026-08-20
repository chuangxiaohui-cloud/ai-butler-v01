/**
 * 主动提醒存储：SQLite reminders 表。
 * gateway 定时轮询到期提醒，标记 fired 后只推送一次。
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface Reminder {
  id: number;
  userId: string;
  conversationId: string;
  message: string;
  remindAt: number;
  createdAt: number;
  fired: boolean;
}

export interface AddReminderInput {
  userId: string;
  conversationId?: string;
  message: string;
  remindAt: number;
}

export function reminderDbPath(): string {
  return process.env.REMINDERS_DB_PATH ?? join(process.cwd(), 'data', 'reminders.db');
}

export class ReminderStore {
  private readonly db: DatabaseSync;

  constructor(dbPath = reminderDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
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
  }

  close(): void {
    this.db.close();
  }

  add(input: AddReminderInput, now = Date.now()): Reminder {
    const result = this.db
      .prepare(
        `INSERT INTO reminders (user_id, conversation_id, message, remind_at, created_at, fired)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .run(input.userId, input.conversationId ?? '', input.message, input.remindAt, now);
    return {
      id: Number(result.lastInsertRowid),
      userId: input.userId,
      conversationId: input.conversationId ?? '',
      message: input.message,
      remindAt: input.remindAt,
      createdAt: now,
      fired: false,
    };
  }

  dueReminders(now = Date.now()): Reminder[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM reminders WHERE fired = 0 AND remind_at <= ? ORDER BY remind_at ASC',
      )
      .all(now) as unknown as ReminderRow[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE reminders SET fired = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
    return rows.map(mapRow);
  }

  /** E163：按 id 取消提醒，返回是否命中 */
  cancel(id: number): boolean {
    const result = this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  list(userId: string, now = Date.now()): Reminder[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC',
      )
      .all(userId) as unknown as ReminderRow[];
    return rows.map(mapRow).map((r) => ({ ...r, fired: r.remindAt <= now }));
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
  };
}
