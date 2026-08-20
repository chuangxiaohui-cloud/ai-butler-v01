import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { ReminderStore } from './reminder-store.js';

function tempDb(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-store-test-'));
  return { path: join(dir, 'reminders.db'), dir };
}

test('reminder-store: cancel 按 id 取消', () => {
  const { path, dir } = tempDb();
  const store = new ReminderStore(path);
  try {
    const now = Date.now();
    const r1 = store.add({ userId: 'u1', message: '开会', remindAt: now + 1000 }, now);
    const r2 = store.add({ userId: 'u1', message: '取快递', remindAt: now + 2000 }, now);
    assert.equal(store.list('u1').length, 2);
    assert.equal(store.cancel(r1.id), true);
    assert.equal(store.cancel(99999), false);
    const left = store.list('u1');
    assert.equal(left.length, 1);
    assert.equal(left[0].id, r2.id);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reminder-store: add/due/list 往返且只触发一次', () => {
  const { path, dir } = tempDb();
  const store = new ReminderStore(path);
  try {
    const now = Date.now();
    store.add({ userId: 'u1', message: '开会', remindAt: now + 1000 }, now);
    assert.equal(store.dueReminders(now).length, 0);
    const due = store.dueReminders(now + 2000);
    assert.equal(due.length, 1);
    assert.equal(due[0].message, '开会');
    assert.equal(store.dueReminders(now + 2000).length, 0);
    assert.equal(store.list('u1', now + 2000).length, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reminder-store: 重复提醒创建时时间已过自动顺延', () => {
  const { path, dir } = tempDb();
  const store = new ReminderStore(path);
  try {
    const now = Date.now();
    const r = store.add({ userId: 'u1', message: '喝水', remindAt: now - 3600_000, repeat: 'daily' }, now);
    assert.equal(r.repeat, 'daily');
    assert.ok(r.remindAt > now);
    assert.ok(r.remindAt - now <= 24 * 3600_000);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reminder-store: 每天提醒到期触发一次并顺延', () => {
  const { path, dir } = tempDb();
  const store = new ReminderStore(path);
  try {
    const now = Date.now();
    store.add({ userId: 'u1', message: '喝水', remindAt: now + 1000, repeat: 'daily' }, now);
    const due = store.dueReminders(now + 2000);
    assert.equal(due.length, 1);
    assert.equal(due[0].message, '喝水');
    assert.equal(store.dueReminders(now + 2000).length, 0);
    const left = store.list('u1', now + 2000);
    assert.equal(left.length, 1);
    assert.equal(left[0].repeat, 'daily');
    assert.ok(left[0].remindAt >= now + 1000 + 24 * 3600_000);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reminder-store: 离线多日每周提醒只补发一次', () => {
  const { path, dir } = tempDb();
  const store = new ReminderStore(path);
  try {
    const now = Date.now();
    const r = store.add({ userId: 'u1', message: '周会', remindAt: now + 1000, repeat: 'weekly' }, now);
    // 模拟离线：把 remind_at 拨回 8 天前（应已错过 1 次）
    const poke = new DatabaseSync(path);
    try {
      poke.prepare('UPDATE reminders SET remind_at = ? WHERE id = ?').run(now - 8 * 24 * 3600_000, r.id);
    } finally {
      poke.close();
    }
    const due = store.dueReminders(now);
    assert.equal(due.length, 1);
    assert.equal(due[0].message, '周会');
    const left = store.list('u1', now);
    assert.equal(left.length, 1);
    assert.ok(left[0].remindAt > now);
    assert.ok(left[0].remindAt - now <= 7 * 24 * 3600_000);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
