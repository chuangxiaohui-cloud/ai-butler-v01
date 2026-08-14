import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildMemoryInjection } from './user-context.js';
import { UserContextStore } from './user-context-store.js';

const DAY_MS = 24 * 3600 * 1000;

function tempDb(): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'user-context-test-'));
  return { path: join(dir, 'user-context.db'), dir };
}

test('user-context-store: profile/fact/session 往返 + 纠正覆盖', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const now = Date.now();
    store.saveProfile(
      'u1',
      {
        role: '一人公司创始人',
        currentProjects: ['短视频运营'],
        preferences: { replyStyle: 'secretary', tone: 'humorous' },
      },
      now,
    );
    store.addFact('u1', '用户喜欢周星驰', 'user_explicit', now);
    store.addFact('u1', '用户在学日语', 'inferred', now);
    store.addSessionSummary('u1', 's1', '讨论短视频选题', ['短视频', '选题'], now);

    const ctx = store.load('u1', now);
    assert.equal(ctx.profile.role, '一人公司创始人');
    assert.equal(ctx.profile.preferences.tone, 'humorous');
    assert.equal(ctx.longTermFacts.length, 2);
    assert.equal(ctx.recentSessions[0].topics[0], '短视频');

    store.correctMemoryFact('u1', '用户在学日语', '用户已完成日语 N4', now);
    const corrected = store.load('u1', now);
    assert.equal(corrected.longTermFacts.some((f) => f.content === '用户已完成日语 N4'), true);
    assert.equal(corrected.longTermFacts.some((f) => f.content === '用户在学日语'), false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: 过期事实归档且不再加载', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const created = Date.now();
    store.addFact('u1', '低置信冷记忆', 'inferred', created, 0.4);
    const later = created + 100 * DAY_MS;
    assert.equal(store.archiveExpired('u1', later), 1);
    const ctx = store.load('u1', later);
    assert.equal(ctx.longTermFacts.length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('user-context-store: buildMemoryInjection 过滤低置信事实', () => {
  const { path, dir } = tempDb();
  const store = new UserContextStore(path);
  try {
    const now = Date.now();
    store.addFact('u1', '用户喜欢周星驰', 'user_explicit', now);
    store.addFact('u1', '临时推测', 'inferred', now);
    const ctx = store.load('u1', now);
    ctx.longTermFacts[1].confidence = 0.3;
    const injection = buildMemoryInjection(ctx);
    assert.ok(injection.includes('周星驰'));
    assert.ok(!injection.includes('临时推测'));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
