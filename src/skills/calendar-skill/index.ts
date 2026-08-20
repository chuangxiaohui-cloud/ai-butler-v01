/**
 * Skill: calendar-skill（R14 执行层）
 * 本地 SQLite 日历：创建日程 / 查询日程，暂不接真实日历服务。
 * E162：创建日程时按解析时间自动登记提醒（ReminderStore），支持“提前 N 分钟/小时”。
 */

import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import { extractTimeExpression } from '../../agent/intent-feature.js';
import { parseTimeExpression } from '../../agent/time-expression.js';
import { ReminderStore } from '../../reminder/reminder-store.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false });
}

function formatLead(ms: number): string {
  if (ms > 0 && ms % 3_600_000 === 0) return `提前 ${ms / 3_600_000} 小时`;
  if (ms > 0) return `提前 ${ms / 60_000} 分钟`;
  return '';
}

/** 解析“提前 N 分钟/小时”，未命中返回 0（到点提醒） */
export function parseLeadMs(query: string): number {
  const m = query.match(/提前\s*(\d+)\s*(分钟|小时)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === '小时' ? n * 3_600_000 : n * 60_000;
}

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

        // E162：日程 ↔ 提醒联动——按解析时间自动登记提醒
        let reminderNote: string;
        const startMs = parsed.startAt ? Date.parse(parsed.startAt) : NaN;
        if (Number.isNaN(startMs)) {
          reminderNote = parsed.startAt
            ? '时间无法解析，未设置提醒'
            : '时间未定，暂未设置提醒，可稍后告诉我具体时间';
        } else {
          const leadMs = parseLeadMs(input.query);
          const remindAt = startMs - leadMs;
          try {
            const store = new ReminderStore();
            try {
              store.add({
                userId: 'default',
                message: `日程提醒：${title}（${timeExpression}）`,
                remindAt,
              });
            } finally {
              store.close();
            }
            reminderNote = `已同步设置提醒（${formatLead(leadMs)}${formatLead(leadMs) ? '，' : ''}${formatDateTime(remindAt)}）`;
          } catch {
            reminderNote = '提醒登记失败（提醒库不可用）';
          }
        }
        return {
          result: `已创建日程：${title}（${timeExpression}，${parsed.startAt}）；${reminderNote}`,
          confidence: 0.8,
          followUpAction: '需要调整提前量、改时间、取消日程，或生成会议邀请邮件，随时说。',
        };
      }

      if (mode === 'query_calendar' || mode === 'local_query' || /查.*(日程|日历|会议)/.test(input.query)) {
        // E162：查询时展示提醒状态（提醒库不可用则仅展示日程）
        let reminderKeys = new Set<string>();
        try {
          const store = new ReminderStore();
          try {
            for (const r of store.list('default')) {
              if (r.message.startsWith('日程提醒：')) {
                reminderKeys.add(r.message.slice('日程提醒：'.length));
              }
            }
          } finally {
            store.close();
          }
        } catch {
          // 忽略：仅展示日程
        }
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
                      `${row.title}（${row.time_expression}，${row.start_at || '时间未定'}${reminderKeys.has(`${row.title}（${row.time_expression}）`) ? '；已设提醒' : '；未设提醒'}）`,
                  )
                  .join('；')}`,
          confidence: 0.8,
          followUpAction: '要新建日程、调整安排或生成会议邀请邮件，随时说。',
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
