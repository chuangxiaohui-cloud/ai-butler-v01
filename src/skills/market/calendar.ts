/**
 * E259：市场 Skill 日历管理（日历/日程通道）
 * 解析用户 query → 新增日程 / 查询日程 / 导出 ICS；复用 calendar-skill 的
 * openCalendarDb/buildCalendarIcs 与 time-expression/ReminderStore 能力。
 * 用户文本只经 E251 input.txt 注入，不进命令行。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRepeatQuery, parseTimeExpression } from '../../agent/time-expression.js';
import { ReminderStore, type ReminderRepeat } from '../../reminder/reminder-store.js';
import { buildCalendarIcs, openCalendarDb, parseLeadMs } from '../calendar-skill/index.js';

/** 仓库根 data/calendar.db（独立于 runner 沙箱 cwd） */
const DEFAULT_DB = join(fileURLToPath(new URL('../../../', import.meta.url)), 'data', 'calendar.db');
/** 导出 .ics 落盘目录（缺省仓库根 data/office，可注入） */
const DEFAULT_OUT = join(fileURLToPath(new URL('../../../', import.meta.url)), 'data', 'office');

export interface CalendarEventRow {
  id: number;
  title: string;
  time_expression: string;
  start_at: string;
  repeat: string;
}

export interface CalendarResult {
  ok: boolean;
  action: 'add' | 'list' | 'export' | 'unknown';
  message?: string;
  title?: string;
  timeExpression?: string;
  startAt?: string;
  repeat?: string;
  leadMs?: number;
  count?: number;
  id?: number;
  path?: string;
  events?: CalendarEventRow[];
  error?: string;
}

/** 解析用户 query：导出→export；查询→list；含时间→add；否则归因提示 */
export function parseCalendarQuery(text: string): Omit<CalendarResult, 'ok'> {
  const trimmed = text.trim();
  if (/导(?:出|存|到|入)|保存.*(?:日历|日程|ics)|(?:日历|日程|ics).*(?:导|存|保存)/i.test(trimmed)) {
    return { action: 'export' };
  }
  if (/查(?:询|看)?.*(?:日程|日历|会议)|(?:日程|日历|会议).*(?:查询|列表|有哪些)|我的日程|我的日历|待办/.test(trimmed)) {
    return { action: 'list' };
  }
  const { repeat, timeExpression, complexPeriod } = parseRepeatQuery(trimmed);
  if (complexPeriod) {
    return { action: 'add', error: '暂不支持工作日/每周末/每月等复杂周期日程，支持「每天」「每周」重复日程' };
  }
  if (!timeExpression) {
    return { action: 'add', error: '未识别到日程时间，请给出时间，如：明天上午10点安排会议' };
  }
  const parsed = parseTimeExpression(timeExpression);
  const startAt = parsed.startAt;
  if (!startAt || Number.isNaN(Date.parse(startAt))) {
    return { action: 'add', error: '时间解析失败，请换一种说法，如：明天上午10点' };
  }
  const title =
    trimmed
      .replace(timeExpression, '')
      .replace(/帮我|请|安排|预约|创建|新建|加个|一个|日程|会议|日历|每天|每日|每周|每星期/g, '')
      .trim()
      .slice(0, 40) || '新日程';
  return { action: 'add', title, timeExpression, startAt, repeat, leadMs: parseLeadMs(trimmed) };
}

/** 执行日历命令（dbPath/outDir 可注入便于测试；缺省仓库根 data/） */
export function runCalendarCommand(
  text: string,
  opts: { dbPath?: string; outDir?: string } = {},
): CalendarResult {
  const parsed = parseCalendarQuery(text);
  if (parsed.error) {
    return { ok: false, action: parsed.action as CalendarResult['action'], error: parsed.error };
  }
  const dbPath = opts.dbPath ?? DEFAULT_DB;
  const outDir = opts.outDir ?? DEFAULT_OUT;
  const database = openCalendarDb(dbPath);
  try {
    if (parsed.action === 'export') {
      const { ics, count } = buildCalendarIcs(database);
      if (count === 0) {
        return { ok: false, action: 'export', count: 0, error: '暂无日程可导出，未生成 ICS 文件。' };
      }
      mkdirSync(outDir, { recursive: true });
      const filePath = join(outDir, `日历-${Date.now()}.ics`);
      writeFileSync(filePath, `${ics}\r\n`, 'utf-8');
      return {
        ok: true,
        action: 'export',
        count,
        path: filePath,
        message: `已导出 ${count} 条日程到 ICS 文件：${filePath}`,
      };
    }
    if (parsed.action === 'list') {
      const rows = database
        .prepare(
          'SELECT id, title, time_expression, start_at, repeat FROM calendar_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        )
        .all('default') as unknown as CalendarEventRow[];
      return {
        ok: true,
        action: 'list',
        count: rows.length,
        events: rows,
        message: rows.length === 0 ? '暂无日程。' : `共 ${rows.length} 条日程`,
      };
    }
    // add：写入日程 + 自动登记提醒（与 calendar-skill 行为一致）
    const now = Date.now();
    const inserted = database
      .prepare(
        `INSERT INTO calendar_events (user_id, title, time_expression, start_at, created_at, repeat)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('default', parsed.title ?? '新日程', parsed.timeExpression ?? '', parsed.startAt ?? '', now, parsed.repeat ?? '');
    let reminderNote = '';
    const startMs = parsed.startAt ? Date.parse(parsed.startAt) : NaN;
    if (!Number.isNaN(startMs)) {
      const remindAt = startMs - (parsed.leadMs ?? 0);
      try {
        const store = new ReminderStore(join(dirname(dbPath), 'reminders.db'));
        try {
          store.add({
            userId: 'default',
            message: `日程提醒：${parsed.title ?? '新日程'}（${parsed.timeExpression ?? ''}）`,
            remindAt,
            repeat: (parsed.repeat ?? '') as ReminderRepeat,
          });
        } finally {
          store.close();
        }
        reminderNote = '已同步设置提醒';
      } catch {
        reminderNote = '提醒登记失败（提醒库不可用）';
      }
    }
    const repeatLabel =
      parsed.repeat === 'daily' ? '每天' : parsed.repeat === 'weekly' ? '每周' : '';
    return {
      ok: true,
      action: 'add',
      id: Number(inserted.lastInsertRowid) as number,
      title: parsed.title,
      timeExpression: parsed.timeExpression,
      startAt: parsed.startAt,
      repeat: parsed.repeat,
      leadMs: parsed.leadMs,
      message: `已创建日程：${parsed.title ?? '新日程'}（${parsed.timeExpression ?? ''}，${parsed.startAt ?? ''}${repeatLabel ? `，${repeatLabel}重复` : ''}）；${reminderNote}`,
    };
  } finally {
    database.close();
  }
}


