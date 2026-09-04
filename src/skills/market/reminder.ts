/**
 * E258：市场 Skill 提醒管理（日历/提醒管理通道）
 * 解析用户 query → 新增提醒 / 查询待触发提醒；复用 time-expression 与 ReminderStore
 * （用户文本只经 E251 input.txt 注入，不进命令行）。
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRepeatQuery, parseTimeExpression } from '../../agent/time-expression.js';
import type { ReminderRepeat } from '../../reminder/reminder-store.js';
import { ReminderStore } from '../../reminder/reminder-store.js';
import { parseLeadMs } from '../calendar-skill/index.js';

/** 仓库 data/reminders.db（独立于 runner 沙箱 cwd） */
const DEFAULT_DB = join(fileURLToPath(new URL('../../', import.meta.url)), 'data', 'reminders.db');

export interface PendingReminder {
  id: number;
  message: string;
  remindAt: number;
  repeat: ReminderRepeat;
}

export interface ReminderResult {
  ok: boolean;
  action: 'add' | 'list' | 'unknown';
  message?: string;
  remindAt?: number;
  repeat?: ReminderRepeat;
  leadMs?: number;
  pending?: PendingReminder[];
  error?: string;
}

/** 解析用户 query：查提醒 → list；含时间 → add；否则归因提示 */
export function parseReminderQuery(text: string): Omit<ReminderResult, 'ok' | 'pending'> {
  const trimmed = text.trim();
  if (/查(?:询)?.*(?:提醒|日程)|(?:提醒|日程).*(?:列表|有哪些)|查看提醒|我的提醒/.test(trimmed)) {
    return { action: 'list' };
  }
  const { repeat, timeExpression, complexPeriod } = parseRepeatQuery(trimmed);
  if (complexPeriod) {
    return { action: 'add', error: '暂不支持工作日/每周末/每月等复杂周期，支持「每天」「每周」重复提醒' };
  }
  if (!timeExpression) {
    return { action: 'add', error: '未识别到提醒时间，请给出时间，如：明天下午3点提醒我开会' };
  }
  const parsed = parseTimeExpression(timeExpression);
  const remindAt = Date.parse(parsed.startAt);
  if (Number.isNaN(remindAt)) {
    return { action: 'add', error: '时间解析失败，请换一种说法，如：明天下午3点' };
  }
  const message =
    trimmed
      .replace(timeExpression, '')
      // E330：去掉「提前N分钟提醒」从句（提前量已由 parseLeadMs 单独解析），并清掉
      // 「帮我/安排/今天/明天/后天」等口语前缀词，避免残句（如“安排的周会”）混进提醒内容。
      .replace(/[，,]\s*提前[^，。；]*提醒/g, '')
      .replace(/帮我|请|提醒我|提醒|一下|设个|设置|安排|今天|明天|后天|每天|每日|每周|每星期/g, '')
      .replace(/^[，,。.、\s]*/, '')
      .replace(/^的+/, '')
      .replace(/[，,。、；;：:\s]+$/g, '')
      .trim()
      .slice(0, 80) || '提醒';
  return { action: 'add', message, remindAt, repeat, leadMs: parseLeadMs(trimmed) };
}

/** 执行提醒命令（dbPath 可注入便于测试；缺省仓库 data/reminders.db） */
export function runReminderCommand(text: string, dbPath = DEFAULT_DB): ReminderResult {
  const parsed = parseReminderQuery(text);
  if (parsed.error) {
    return { ok: false, action: parsed.action as ReminderResult['action'], error: parsed.error };
  }
  const store = new ReminderStore(dbPath);
  try {
    if (parsed.action === 'list') {
      const pending: PendingReminder[] = store
        .list('default')
        .filter((r) => !r.fired)
        .slice(0, 10)
        .map((r) => ({ id: r.id, message: r.message, remindAt: r.remindAt, repeat: r.repeat }));
      return { ok: true, action: 'list', pending };
    }
    const added = store.add({
      userId: 'default',
      message: parsed.message ?? '提醒',
      remindAt: parsed.remindAt ?? Date.now(),
      repeat: parsed.repeat ?? '',
    });
    return {
      ok: true,
      action: 'add',
      message: added.message,
      remindAt: added.remindAt,
      repeat: added.repeat,
      leadMs: parsed.leadMs,
    };
  } finally {
    store.close();
  }
}
