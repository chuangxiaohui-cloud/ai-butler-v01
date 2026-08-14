/**
 * Skill: calendar-skill（R14 执行层）
 * 本地 SQLite 日历：创建日程 / 查询日程，暂不接真实日历服务。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import { extractTimeExpression } from '../../agent/intent-feature.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

function parseTimeExpression(expression: string): { startAt: string; label: string } {
  const now = new Date();
  const date = new Date(now);
  if (/后天/.test(expression)) date.setDate(date.getDate() + 2);
  else if (/明天/.test(expression)) date.setDate(date.getDate() + 1);
  else if (/今天/.test(expression)) date.setDate(date.getDate());

  const hourMap: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    十一: 11, 十二: 12,
  };
  let hour = 9;
  const digit = expression.match(/(\d{1,2})\s*[点时:：]/);
  const chinese = expression.match(/([一二三四五六七八九十]{1,2})点/);
  if (digit) hour = Number(digit[1]);
  else if (chinese) hour = hourMap[chinese[1]] ?? 9;
  if (/下午|晚上/.test(expression) && hour < 12) hour += 12;
  const minute = expression.match(/(\d{1,2})\s*分/)?.[1] ?? '0';
  date.setHours(hour, Number(minute), 0, 0);
  return { startAt: date.toISOString(), label: expression };
}

export function createCalendarSkill(
  opts?: { dbPath?: string },
): ExecutableSkill & { close(): void } {
  const dbPath =
    opts?.dbPath ??
    process.env.CALENDAR_DB_PATH ??
    join(process.cwd(), 'data', 'calendar.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
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
            result: { error: 'missing_time' },
            confidence: 0.3,
            followUpAction: '请补充具体时间，例如“明天上午十点”。',
          };
        }
        const title =
          input.query.replace(/帮我|安排|预约|订|会议|日程|的/g, '').trim() || '新日程';
        const now = Date.now();
        const parsed = parseTimeExpression(timeExpression);
        const inserted = db
          .prepare(
            `INSERT INTO calendar_events (user_id, title, time_expression, start_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run('default', title, timeExpression, parsed.startAt, now);
        return {
          result: {
            ok: true,
            title,
            timeExpression,
            startAt: parsed.startAt,
            eventId: String(inserted.lastInsertRowid),
          },
          confidence: 0.8,
          followUpAction: '需要我设置提醒或改成重复日程吗？',
        };
      }

      if (mode === 'query_calendar' || mode === 'local_query' || /查.*(日程|日历|会议)/.test(input.query)) {
        const rows = db
          .prepare(
            'SELECT id, title, time_expression, start_at, created_at FROM calendar_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
          )
          .all('default');
        return {
          result: { events: rows, count: rows.length },
          confidence: 0.8,
          followUpAction: '要新建日程或调整已有安排，随时说。',
        };
      }

      return {
        result: { error: 'unknown_mode' },
        confidence: 0.2,
        followUpAction: '暂不支持该日历操作。',
      };
    },
  };
  return Object.assign(skill, { close: () => db.close() });
}
