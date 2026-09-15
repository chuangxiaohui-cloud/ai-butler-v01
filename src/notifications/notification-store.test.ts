import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { clearJsonlReadCache } from '../log/jsonl.js';
import { NotificationStore, emitSkillNotification, notificationLogPath } from './notification-store.js';

function tempLog(): string {
  const dir = mkdtempSync(join(tmpdir(), 'notify-test-'));
  return join(dir, 'notifications.jsonl');
}

test('notification-store: add + recent 往返（E315）', () => {
  const file = tempLog();
  const store = new NotificationStore(file);
  try {
    store.add({ role: '老板', kind: 'risk_decision', title: '待你裁决', detail: '打样费 100 元？' });
    store.add({ role: '秘书', kind: 'escalation', title: '连续失败升级' });
    const recent = store.recent();
    assert.equal(recent.length, 2);
    assert.equal(recent[0]?.role, '老板');
    assert.equal(recent[0]?.kind, 'risk_decision');
    assert.equal(recent[0]?.source, 'decision');
    assert.ok(recent[0]?.id);
    assert.ok(recent[0]?.ts);
    assert.equal(recent[1]?.title, '连续失败升级');
  } finally {
    store.close();
    clearJsonlReadCache();
    rmSync(dirname(file), { recursive: true, force: true });
  }
});

test('notification-store: decisionId 透传往返（E336）', () => {
  const file = tempLog();
  const store = new NotificationStore(file);
  try {
    store.add({
      role: '老板',
      kind: 'risk_decision',
      title: '待你裁决',
      detail: '帮我安排明天下午3点的周会？',
      decisionId: 'decision-abc',
    });
    const recent = store.recent();
    assert.equal(recent.length, 1);
    assert.equal(recent[0]?.decisionId, 'decision-abc');
    assert.equal(store.all().length, 1);
    assert.equal(store.all()[0]?.decisionId, 'decision-abc');
  } finally {
    store.close();
    clearJsonlReadCache();
    rmSync(dirname(file), { recursive: true, force: true });
  }
});

test('notification-store: source=skill 透传 + recent 条数限制（E315）', () => {
  const file = tempLog();
  const store = new NotificationStore(file);
  try {
    store.add({ role: '产品经理', kind: 'prd_done', title: 'PRD 已完成', source: 'skill' });
    store.add({ role: '项目经理', kind: 'progress', title: '进度更新' });
    assert.equal(store.recent(1).length, 1);
    assert.equal(store.recent(1)[0]?.title, '进度更新');
    assert.equal(store.recent()[0]?.source, 'skill');
  } finally {
    store.close();
    clearJsonlReadCache();
    rmSync(dirname(file), { recursive: true, force: true });
  }
});

test('notification-store: env 覆盖路径（E315）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'notify-env-'));
  const file = join(dir, 'n.jsonl');
  process.env.NOTIFICATION_LOG_PATH = file;
  try {
    assert.equal(notificationLogPath(), file);
  } finally {
    delete process.env.NOTIFICATION_LOG_PATH;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('notification-store: 缺省路径锚定仓库 data/（E315）', () => {
  delete process.env.NOTIFICATION_LOG_PATH;
  const path = notificationLogPath();
  assert.ok(path.includes('data'));
  assert.ok(path.endsWith('notifications.jsonl'));
});

test('notification-store: emitSkillNotification 写入 source=skill（E316）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'notify-emit-'));
  const file = join(dir, 'n.jsonl');
  process.env.NOTIFICATION_LOG_PATH = file;
  try {
    emitSkillNotification({ role: '产品经理', kind: 'prd_done', title: 'PRD 模板已生成' });
    const store = new NotificationStore(file);
    try {
      const recent = store.recent();
      assert.equal(recent.length, 1);
      assert.equal(recent[0]?.role, '产品经理');
      assert.equal(recent[0]?.kind, 'prd_done');
      assert.equal(recent[0]?.source, 'skill');
    } finally {
      store.close();
    }
  } finally {
    delete process.env.NOTIFICATION_LOG_PATH;
    clearJsonlReadCache();
    rmSync(dir, { recursive: true, force: true });
  }
});
