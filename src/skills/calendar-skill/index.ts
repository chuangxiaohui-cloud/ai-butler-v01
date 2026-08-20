/**
 * Skill: calendar-skill（R14 执行层）
 * 本地 SQLite 日历：创建日程 / 查询日程，暂不接真实日历服务。
 * E162：创建日程时按解析时间自动登记提醒（ReminderStore），支持“提前 N 分钟/小时”。
 * E166：重复日程（每天/每周）复用 ReminderStore.repeat 机制，查询展示周期。
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

import { parseTimeExpression, parseRepeatQuery } from '../../agent/time-expression.js';
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

/** ICS 文本转义：反斜杠/换行/逗号/分号（RFC 5545 文本值） */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** ISO 时间 → UTC ICS 时间 YYYYMMDDTHHMMSSZ；无法解析返回空串 */
function toIcsDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** E169：日历/日程导出关键词检测（与意图层一致，避免“查保存的日程”误触发） */
export function isCalendarExportQuery(query: string): boolean {
  return /导(?:出|下载).*(日历|日程)|保存.*(?:日历|日程)|(?:日历|日程).*(导出|保存|下载|\.?ics)/i.test(query);
}

export function createCalendarSkill(
  opts?: { dbPath?: string; outDir?: string },
): ExecutableSkill & { close(): void } {
  const dbPath =
    opts?.dbPath ??
    process.env.CALENDAR_DB_PATH ??
    join(process.cwd(), 'data', 'calendar.db');
  const outDir =
    opts?.outDir ?? process.env.CALENDAR_OUT_DIR ?? join(process.cwd(), 'data', 'office');
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
          created_at INTEGER NOT NULL,
          repeat TEXT NOT NULL DEFAULT ''
        );
      `);
      try {
        db.exec("ALTER TABLE calendar_events ADD COLUMN start_at TEXT NOT NULL DEFAULT ''");
      } catch {
        // 列已存在则跳过
      }
      try {
        db.exec("ALTER TABLE calendar_events ADD COLUMN repeat TEXT NOT NULL DEFAULT ''");
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
        // E166：周期识别与复杂周期诚实提示（与提醒共用 time-expression 助手）
        const { repeat, timeExpression, complexPeriod } = parseRepeatQuery(input.query);
        if (complexPeriod) {
          return {
            result: '目前暂不支持工作日、每周末、每月等复杂周期日程，支持“每天”“每周”重复日程。',
            confidence: 0.5,
            followUpAction: '例如“每天早上9点安排站会”或“每周一9点安排周会”。',
          };
        }
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
            `INSERT INTO calendar_events (user_id, title, time_expression, start_at, created_at, repeat)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('default', title, timeExpression, parsed.startAt, now, repeat);

        // E162：日程 ↔ 提醒联动——按解析时间自动登记提醒（E166：重复日程透传周期）
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
                repeat,
              });
            } finally {
              store.close();
            }
            reminderNote = `已同步设置提醒（${formatLead(leadMs)}${formatLead(leadMs) ? '，' : ''}${formatDateTime(remindAt)}）`;
          } catch {
            reminderNote = '提醒登记失败（提醒库不可用）';
          }
        }
        const repeatLabel = repeat === 'daily' ? '每天' : repeat === 'weekly' ? '每周' : '';
        return {
          result: `已创建日程：${title}（${timeExpression}，${parsed.startAt}${repeat ? `，${repeatLabel}重复` : ''}）；${reminderNote}`,
          confidence: 0.8,
          followUpAction: '需要调整提前量、改时间、取消日程，或生成会议邀请邮件，随时说。',
        };
      }

      if (mode === 'query_calendar' || mode === 'local_query' || /查.*(日程|日历|会议)/.test(input.query)) {
        // E169：导出/保存/下载日历 → 生成 .ics 落盘（空日程诚实提示）
        if (isCalendarExportQuery(input.query)) {
          const database = ensureDb();
          const rows = database
            .prepare(
              'SELECT id, title, time_expression, start_at, created_at, repeat FROM calendar_events WHERE user_id = ? ORDER BY created_at ASC',
            )
            .all('default') as unknown as Array<{
            id: number;
            title: string;
            time_expression: string;
            start_at: string;
            created_at: number;
            repeat: string;
          }>;
          if (rows.length === 0) {
            return {
              result: '暂无日程可导出，未生成 ICS 文件。',
              confidence: 0.7,
              followUpAction: '先告诉我需要安排的日程，例如“明天上午十点开会”。',
            };
          }
          const nowIcs = toIcsDateTime(new Date().toISOString());
          const events = rows.map((row) => {
            const startIcs = toIcsDateTime(
              row.start_at || new Date(row.created_at).toISOString(),
            );
            const rrule =
              row.repeat === 'daily'
                ? '\r\nRRULE:FREQ=DAILY'
                : row.repeat === 'weekly'
                  ? '\r\nRRULE:FREQ=WEEKLY'
                  : '';
            return [
              'BEGIN:VEVENT',
              `UID:event-${row.id}@ai-butler.local`,
              `DTSTAMP:${nowIcs}`,
              `DTSTART:${startIcs}`,
              `SUMMARY:${escapeIcsText(row.title)}`,
              rrule,
              'END:VEVENT',
            ]
              .filter(Boolean)
              .join('\r\n');
          });
          const ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//AI-Butler//LocalCalendar//CN',
            'CALSCALE:GREGORIAN',
            ...events,
            'END:VCALENDAR',
          ].join('\r\n');
          mkdirSync(outDir, { recursive: true });
          const filePath = join(outDir, `日历-${Date.now()}.ics`);
          writeFileSync(filePath, `${ics}\r\n`, 'utf-8');
          return {
            result: {
              answer: `已导出 ${rows.length} 条日程到 ICS 文件：${filePath}`,
              path: filePath,
              count: rows.length,
            },
            confidence: 0.8,
            followUpAction: '该 .ics 可导入 Outlook / 苹果日历 / 谷歌日历；需要调整日程或生成会议邀请邮件，随时说。',
          };
        }
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
            'SELECT id, title, time_expression, start_at, created_at, repeat FROM calendar_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
          )
          .all('default') as unknown as Array<{
          id: number;
          title: string;
          time_expression: string;
          start_at: string;
          created_at: number;
          repeat: string;
        }>;
        return {
          result:
            rows.length === 0
              ? '暂无日程。'
              : `共 ${rows.length} 条日程：${rows
                  .map((row) => {
                    const repeatLabel =
                      row.repeat === 'daily' ? '每天' : row.repeat === 'weekly' ? '每周' : '';
                    return `${row.title}（${row.time_expression}，${row.start_at || '时间未定'}${repeatLabel ? `，${repeatLabel}重复` : ''}${reminderKeys.has(`${row.title}（${row.time_expression}）`) ? '；已设提醒' : '；未设提醒'}）`;
                  })
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
