/**
 * Skill: calendar-skill（R14 执行层）
 * 本地 SQLite 日历：创建日程 / 查询日程，暂不接真实日历服务。
 * E162：创建日程时按解析时间自动登记提醒（ReminderStore），支持“提前 N 分钟/小时”。
 * E166：重复日程（每天/每周）复用 ReminderStore.repeat 机制，查询展示周期。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
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
/** E171：日历/日程导入关键词检测（与意图层一致） */
export function isCalendarImportQuery(query: string): boolean {
  return /导(?:入|进).*(日历|日程|ics)|(?:日历|日程|ics).*导(?:入|进)/i.test(query);
}

/** ICS 转义文本反转义：\\n→换行、\\,→逗号、\\;→分号、\\\\→反斜杠 */
function unescapeIcsText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** 展开 RFC 5545 折叠行（续行以空格/制表符开头） */
function unfoldIcs(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '');
}

/** 取属性值：忽略 DTSTART;VALUE=DATE 等参数，返回冒号后的值 */
function icsValue(body: string, key: string): string {
  const m = body.match(new RegExp(`^${key}(?:;[^\\r\\n:]*)?:(.*)$`, 'im'));
  return m?.[1]?.trim() ?? '';
}

/** DTSTART → ISO 字符串；支持 UTC（Z）、本地时间、全天日期；无法解析返回空串 */
function icsStartToIso(dtstart: string): string {
  const m = dtstart.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const s = Number(m[6] ?? 0);
  if (m[7]) {
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString();
  }
  if (!m[4]) {
    // 全天日期：按当天 00:00（UTC 表示）
    return new Date(Date.UTC(y, mo - 1, d)).toISOString();
  }
  // 无时区：按本地时间解析
  return new Date(y, mo - 1, d, h, mi, s).toISOString();
}

export interface IcsEvent {
  uid: string;
  summary: string;
  dtstart: string;
  startAtIso: string;
  rrule: string;
  repeat: 'daily' | 'weekly' | '';
  complexRepeat: boolean;
}

/** 解析 .ics 文本为日程列表（支持多 VEVENT；无 DTSTART 的事件丢弃） */
export function parseIcs(text: string): IcsEvent[] {
  const unfolded = unfoldIcs(text.replace(/^\uFEFF/, ''));
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const events: IcsEvent[] = [];
  for (const block of blocks) {
    const end = block.search(/END:VEVENT/i);
    const body = end >= 0 ? block.slice(0, end) : block;
    const summary = unescapeIcsText(icsValue(body, 'SUMMARY')) || '未命名日程';
    const dtstart = icsValue(body, 'DTSTART');
    if (!dtstart) continue;
    const rrule = icsValue(body, 'RRULE');
    const freq = rrule.match(/FREQ=(\w+)/i)?.[1]?.toUpperCase() ?? '';
    const repeat = freq === 'DAILY' ? 'daily' : freq === 'WEEKLY' ? 'weekly' : '';
    events.push({
      uid: icsValue(body, 'UID') || '',
      summary,
      dtstart,
      startAtIso: icsStartToIso(dtstart),
      rrule,
      repeat,
      complexRepeat: freq !== '' && repeat === '',
    });
  }
  return events;
}

export function isCalendarExportQuery(query: string): boolean {
  return /导(?:出|下载).*(日历|日程)|保存.*(?:日历|日程)|(?:日历|日程).*(导出|保存|下载|\.?ics)/i.test(query);
}

/** E179：打开（必要时创建）本地日历库，返回 DatabaseSync（调用方负责 close） */
export function openCalendarDb(dbPath?: string): DatabaseSync {
  const resolved =
    dbPath ?? process.env.CALENDAR_DB_PATH ?? join(process.cwd(), 'data', 'calendar.db');
  mkdirSync(dirname(resolved), { recursive: true });
  const database = new DatabaseSync(resolved);
  database.exec(`
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
    database.exec("ALTER TABLE calendar_events ADD COLUMN start_at TEXT NOT NULL DEFAULT ''");
  } catch {
    // 列已存在则跳过
  }
  try {
    database.exec("ALTER TABLE calendar_events ADD COLUMN repeat TEXT NOT NULL DEFAULT ''");
  } catch {
    // 列已存在则跳过
  }
  return database;
}

/** E179：本地日历 → ICS 文本（全部日程按创建时间升序）；空库 count=0 */
export function buildCalendarIcs(
  database: DatabaseSync,
  now = new Date(),
): { ics: string; count: number } {
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
  const nowIcs = toIcsDateTime(now.toISOString());
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
  return { ics, count: rows.length };
}

/** E179：解析 .ics 文本并写入本地日历（无有效时间/复杂重复跳过）；返回计数 */
export function importIcsToDb(
  database: DatabaseSync,
  icsText: string,
  now = Date.now(),
): { imported: number; skipped: number; total: number } {
  const parsed = parseIcs(icsText);
  let imported = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const ev of parsed) {
    if (ev.complexRepeat || !ev.startAtIso) {
      skipped += 1;
      continue;
    }
    const dedupKey = `${ev.summary}|${ev.startAtIso}|${ev.repeat}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    database
      .prepare(
        `INSERT INTO calendar_events (user_id, title, time_expression, start_at, created_at, repeat)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('default', ev.summary, `导入：${ev.dtstart}`, ev.startAtIso, now, ev.repeat);
    imported += 1;
  }
  return { imported, skipped, total: parsed.length };
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
      db = openCalendarDb(dbPath);
    }
    return db;
  }

  const skill: ExecutableSkill = {
    name: 'calendar-skill',
    version: '0.1.0',
    triggers: ['日程', '会议', '安排', '预约', '日历'],
    async execute(input: SkillInput, _deps: SkillDeps): Promise<SkillOutput> {
      const mode = typeof input.params?.mode === 'string' ? input.params.mode : '';
      // E171：导入 .ics 文件（附件或查询显式路径）→ 解析并写入本地日历
      if (isCalendarImportQuery(input.query)) {
        let icsText = '';
        const attached = input.rawFiles.find(
          (f) => /\.ics$/i.test(f.name) || f.type.includes('calendar'),
        );
        if (attached) {
          const buf = Buffer.from(await attached.arrayBuffer());
          icsText = buf.toString('utf-8');
        } else {
          const pathMatch = input.query.match(
            /([A-Za-z]:[\\/][^\s，。；;]+\.ics|[\\/][^\s，。；;]+\.ics)/i,
          );
          if (pathMatch) {
            try {
              icsText = readFileSync(pathMatch[1].trim(), 'utf-8');
            } catch (err) {
              return {
                result: `无法读取文件：${pathMatch[1].trim()}（${err instanceof Error ? err.message : String(err)}）`,
                confidence: 0.3,
                followUpAction: '请确认路径正确，或直接上传 .ics 文件。',
              };
            }
          }
        }
        if (!icsText.trim()) {
          return {
            result: '请上传 .ics 文件，或告诉我文件路径（例如 M:\\events.ics），我来导入日程。',
            confidence: 0.4,
          };
        }
        const database = ensureDb();
        const { imported, skipped, total } = importIcsToDb(database, icsText);
        if (total === 0) {
          return {
            result: '未在文件中解析到可导入的日程，请确认这是标准 iCalendar（.ics）文件。',
            confidence: 0.4,
          };
        }
        let answer = `已从 .ics 导入 ${imported} 条日程`;
        if (skipped > 0) {
          answer += `，跳过 ${skipped} 条（无有效时间或每月/每年等复杂重复暂不支持）`;
        }
        answer += '；导入不自动设置提醒，需要提醒可单独说。';
        return {
          result: { answer, count: imported, skipped },
          confidence: 0.85,
          followUpAction: '可以查询日程确认，或继续导入其他日历文件。',
        };
      }

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
          const { ics, count } = buildCalendarIcs(database);
          if (count === 0) {
            return {
              result: '暂无日程可导出，未生成 ICS 文件。',
              confidence: 0.7,
              followUpAction: '先告诉我需要安排的日程，例如“明天上午十点开会”。',
            };
          }
          mkdirSync(outDir, { recursive: true });
          const filePath = join(outDir, `日历-${Date.now()}.ics`);
          writeFileSync(filePath, `${ics}\r\n`, 'utf-8');
          return {
            result: {
              answer: `已导出 ${count} 条日程到 ICS 文件：${filePath}`,
              path: filePath,
              count,
            },
            confidence: 0.8,
            followUpAction: '该 .ics 可导入 Outlook / 苹果日历 / 谷歌日历；需要调整日程或生成会议邀请邮件，随时说。'
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

