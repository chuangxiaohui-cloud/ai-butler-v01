import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCalendarQuery, runCalendarCommand } from './calendar.js';

test('calendar: 解析新增日程（明天上午10点安排会议）', () => {
  const parsed = parseCalendarQuery('明天上午10点安排会议');
  assert.equal(parsed.action, 'add');
  assert.ok(parsed.title !== undefined && parsed.title.length > 0);
  assert.ok(parsed.startAt !== undefined && Date.parse(parsed.startAt) > Date.now());
  assert.equal(parsed.repeat, '');
});

test('calendar: 重复日程（每天早上9点站会）', () => {
  const parsed = parseCalendarQuery('每天早上9点安排站会');
  assert.equal(parsed.action, 'add');
  assert.equal(parsed.repeat, 'daily');
});

test('calendar: 提前量解析', () => {
  const parsed = parseCalendarQuery('明天上午10点提前30分钟安排会议');
  assert.equal(parsed.leadMs, 30 * 60 * 1000);
});

test('calendar: 无时间 → 归因提示', () => {
  const parsed = parseCalendarQuery('帮我安排会议');
  assert.equal(parsed.action, 'add');
  assert.ok(parsed.error !== undefined && parsed.error.includes('时间'));
});

test('calendar: 查询 → list', () => {
  const parsed = parseCalendarQuery('查询我的日程');
  assert.equal(parsed.action, 'list');
});

test('calendar: 导出 → export', () => {
  const parsed = parseCalendarQuery('导出日程为ics文件');
  assert.equal(parsed.action, 'export');
});

test('calendar: 新增+查询+导出全链（temp db）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-'));
  try {
    const dbPath = join(dir, 'calendar.db');
    const added = runCalendarCommand('明天上午10点安排周会', { dbPath, outDir: dir });
    assert.equal(added.ok, true);
    assert.equal(added.action, 'add');
    assert.equal(added.title, '周会');
    const listed = runCalendarCommand('查询我的日程', { dbPath, outDir: dir });
    assert.equal(listed.ok, true);
    assert.equal(listed.action, 'list');
    assert.equal(listed.count, 1);
    assert.equal(listed.events?.[0].title, '周会');
    const exported = runCalendarCommand('导出日程为ics', { dbPath, outDir: dir });
    assert.equal(exported.ok, true);
    assert.equal(exported.action, 'export');
    assert.equal(exported.count, 1);
    assert.ok(exported.path !== undefined);
    const ics = readFileSync(exported.path, 'utf-8');
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('SUMMARY:周会'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('calendar: 空库导出 → 诚实提示', () => {
  const dir = mkdtempSync(join(tmpdir(), 'calendar-skill-empty-'));
  try {
    const dbPath = join(dir, 'calendar.db');
    const exported = runCalendarCommand('导出日程为ics', { dbPath, outDir: dir });
    assert.equal(exported.ok, false);
    assert.ok(exported.error !== undefined && exported.error.includes('暂无日程'));
    assert.equal(existsSync(join(dir, '日历-0.ics')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
