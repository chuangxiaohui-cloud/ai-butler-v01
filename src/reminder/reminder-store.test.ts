import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ReminderStore } from './reminder-store.js';

function tempDb(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-store-test-'));
  return { path: join(dir, 'reminders.db'), dir };
}

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
