/**
 * Skill: calendar-skill（R14 执行层）
 * 本地 SQLite 日历：创建日程 / 查询日程，暂不接真实日历服务。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import { extractTimeExpression } from '../../agent/intent-feature.js';
import { parseTimeExpression } from '../../agent/time-expression.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

export function createCalendarSkill(
  opts?: { dbPath?: string },
): ExecutableSkill & { close(): void } {
  const dbPath =
    opts?.dbPath ??
    process.env.CALENDAR_DB_PATH ??
    join(process.cwd(), 'data', 'calendar.db');
  let db: DatabaseSync | null = null;
  function ensureDb(): DatabaseSync {
    if (!db) {
      mkdirSync(dirname(dbPath), { recursive: true });
      db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          time_expression TEXT NOT NULL,
          start_at TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL
        );
      `);
      try {
        db.exec("ALTER TABLE calendar_events ADD COLUMN start_at TEXT NOT NULL DEFAULT ''");
      } catch {
        // 列已存在则跳过
      }
    }
    return db;
  }

  const skill: ExecutableSkill = {
    name: 'calendar-skill',
    version: '0.1.0',
    triggers: ['日程', '会议', '安排', '预约', '日历'],
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const mode = typeof input.params?.mode === 'string' ? input.params.mode : '';
      if (mode === 'create_calendar' || /安排|预约|帮我订/.test(input.query)) {
        const timeExpression = extractTimeExpression(input.query);
        if (!timeExpression) {
          return {
            result: '请问您想安排在什么时间？例如“明天上午十点”。',
            confidence: 0.3,
            followUpAction: '请补充具体时间，例如“明天上午十点”。',
          };
        }
        const title =
          input.query.replace(/帮我|安排|预约|订|会议|日程|的/g, '').trim() || '新日程';
        const now = Date.now();
        const parsed = parseTimeExpression(timeExpression);
        const database = ensureDb();
        const inserted = database
          .prepare(
            `INSERT INTO calendar_events (user_id, title, time_expression, start_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run('default', title, timeExpression, parsed.startAt, now);
        return {
          result: `已创建日程：${title}（${timeExpression}，${parsed.startAt}）`,
          confidence: 0.8,
          followUpAction: '需要我设置提醒或改成重复日程吗？',
        };
      }

      if (mode === 'query_calendar' || mode === 'local_query' || /查.*(日程|日历|会议)/.test(input.query)) {
        const database = ensureDb();
        const rows = database
          .prepare(
            'SELECT id, title, time_expression, start_at, created_at FROM calendar_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
          )
          .all('default');
        return {
          result:
            rows.length === 0
              ? '暂无日程。'
              : `共 ${rows.length} 条日程：${rows
                  .map(
                    (row) =>
                      `${row.title}（${row.time_expression}，${row.start_at || '时间未定'}）`,
                  )
                  .join('；')}`,
          confidence: 0.8,
          followUpAction: '要新建日程或调整已有安排，随时说。',
        };
      }

      return {
        result: '暂不支持该日历操作。',
        confidence: 0.2,
        followUpAction: '暂不支持该日历操作。',
      };
    },
  };
  return Object.assign(skill, {
    close: () => {
      db?.close();
      db = null;
    },
  });
}
