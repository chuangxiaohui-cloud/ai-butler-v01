import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildMemoryInjection } from '../../src/memory/user-context.js';
import { UserContextStore } from '../../src/memory/user-context-store.js';

const DAY_MS = 24 * 3600 * 1000;

test('INT-006：UserContextStore 全链路（profile/fact/session/衰减/注入）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'int-user-context-'));
  const store = new UserContextStore(join(dir, 'user-context.db'));
  try {
    const created = Date.now();
    store.saveProfile(
      'u1',
      {
        role: '一人公司创始人',
        currentProjects: ['短视频运营', 'AI工具评测'],
        preferences: { replyStyle: 'secretary', tone: 'humorous' },
      },
      created,
    );
    store.addFact('u1', '用户喜欢周星驰', 'user_explicit', created);
    store.addFact('u1', '用户在学日语', 'inferred', created);
    store.addSessionSummary('u1', 's1', '讨论短视频选题', ['短视频', '选题'], created);

    const later = created + 60 * DAY_MS;
    const ctx = store.load('u1', later);
    assert.equal(ctx.profile.currentProjects[0], '短视频运营');
    assert.equal(ctx.recentSessions[0].topics[0], '短视频');
    const inferred = ctx.longTermFacts.find((f) => f.content === '用户在学日语');
    assert.ok(inferred);
    assert.ok(Math.abs(inferred.confidence - 0.6 * 0.9) < 1e-9);

    const injection = buildMemoryInjection(ctx);
    assert.ok(injection.includes('用户喜欢周星驰'));
    assert.ok(injection.includes('短视频选题'));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
