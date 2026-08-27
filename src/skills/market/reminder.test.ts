import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseReminderQuery, runReminderCommand } from './reminder.js';

test('reminder: 解析新增提醒（明天下午3点 + 消息）', () => {
  const parsed = parseReminderQuery('明天下午3点提醒我开会');
  assert.equal(parsed.action, 'add');
  assert.equal(parsed.message, '开会');
  assert.ok(parsed.remindAt !== undefined && parsed.remindAt > Date.now());
  assert.equal(parsed.repeat, '');
});

test('reminder: 重复提醒（每天早上9点站会）', () => {
  const parsed = parseReminderQuery('每天早上9点提醒我站会');
  assert.equal(parsed.action, 'add');
  assert.equal(parsed.repeat, 'daily');
  assert.equal(parsed.message, '站会');
});

test('reminder: 提前量解析', () => {
  const parsed = parseReminderQuery('明天下午3点提前30分钟提醒我开会');
  assert.equal(parsed.leadMs, 30 * 60 * 1000);
});

test('reminder: 无时间 → 归因提示', () => {
  const parsed = parseReminderQuery('提醒我交周报');
  assert.equal(parsed.action, 'add');
  assert.ok(parsed.error !== undefined && parsed.error.includes('时间'));
});

test('reminder: 复杂周期 → 诚实拒绝', () => {
  const parsed = parseReminderQuery('每周一到周五提醒我打卡');
  assert.ok(parsed.error !== undefined && parsed.error.includes('复杂周期'));
});

test('reminder: 查询待触发提醒（temp db 全链）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-skill-'));
  try {
    const dbPath = join(dir, 'reminders.db');
    const added = runReminderCommand('明天下午3点提醒我交周报', dbPath);
    assert.equal(added.ok, true);
    assert.equal(added.action, 'add');
    assert.equal(added.message, '交周报');
    const listed = runReminderCommand('查询我的提醒', dbPath);
    assert.equal(listed.ok, true);
    assert.equal(listed.action, 'list');
    assert.equal(listed.pending?.length, 1);
    assert.equal(listed.pending?.[0].message, '交周报');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
