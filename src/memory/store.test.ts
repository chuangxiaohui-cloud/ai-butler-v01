import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { MemoryCoreStore } from './memorycore-store.js';
import { SqliteDirectStore, createDefaultMemoryStore, defaultMemoryStore, resolveMemoryStoreKind } from './store.js';

test('store: schema v1 建表 + put/recall/forget 往返', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-test-'));
  const dbPath = join(dir, 'memory.db');
  const store = new SqliteDirectStore(dbPath);
  try {
    const id = await store.put({
      session_id: 's1',
      query: 'STM32F103C8T6 最大主频是多少',
      answer: '72MHz',
      confidence: 0.9,
      evidence_hash: 'abc123',
      timestamp: Date.now(),
    });
    assert.ok(Number(id) > 0);
    const recalled = await store.recall('s1');
    assert.equal(recalled.length, 1);
    assert.equal(recalled[0].query, 'STM32F103C8T6 最大主频是多少');
    assert.equal(recalled[0].answer, '72MHz');
    assert.equal(recalled[0].evidence_hash, 'abc123');
    await store.forget('s1');
    assert.equal((await store.recall('s1')).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: recall 按时间倒序并受 limit 约束', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'memory-test-'));
  const dbPath = join(dir, 'memory.db');
  const store = new SqliteDirectStore(dbPath);
  try {
    for (let i = 0; i < 3; i++) {
      await store.put({
        session_id: 's2',
        query: `q${i}`,
        answer: `a${i}`,
        confidence: 1,
        evidence_hash: `h${i}`,
        timestamp: 1000 + i,
      });
    }
    const recalled = await store.recall('s2', 2);
    assert.equal(recalled.length, 2);
    assert.equal(recalled[0].query, 'q2');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: MEMORY_STORE 缺省/未知回退 sqlite（§8.1.4 切换）', () => {
  assert.equal(resolveMemoryStoreKind({}), 'sqlite');
  assert.equal(resolveMemoryStoreKind({ MEMORY_STORE: 'memorycore' }), 'memorycore');
  assert.equal(resolveMemoryStoreKind({ MEMORY_STORE: 'bogus' }), 'sqlite', '未知值安全回退 sqlite');
  const store = createDefaultMemoryStore('sqlite', {});
  assert.ok(store instanceof SqliteDirectStore);
});

test('store: MEMORY_STORE=memorycore 切换到 MemoryCoreStore（§8.4 同接口同 schema）', () => {
  const store = createDefaultMemoryStore('memorycore', {
    MEMORY_CORE_TEAM_ID: 'team-t',
    MEMORY_CORE_AGENT_ID: 'agent-a',
    MEMORY_CORE_USER_ID: 'user-u',
    TDAI_GATEWAY_API_KEY: 'sk-strong-test-key',
  });
  assert.ok(store instanceof MemoryCoreStore);
  assert.equal(typeof store.put, 'function');
  assert.equal(typeof store.recall, 'function');
});

test('store: memorycore 缺身份三元组或弱 key 显式抛错不静默回退（S3）', () => {
  assert.throws(
    () => createDefaultMemoryStore('memorycore', { TDAI_GATEWAY_API_KEY: 'sk-strong-test-key' }),
    /身份三元组/,
  );
  assert.throws(
    () =>
      createDefaultMemoryStore('memorycore', {
        MEMORY_CORE_TEAM_ID: 't',
        MEMORY_CORE_AGENT_ID: 'a',
        MEMORY_CORE_USER_ID: 'u',
        TDAI_GATEWAY_API_KEY: 'local-dev-key',
      }),
    /弱默认 key/,
  );
});

test('store: defaultMemoryStore 默认 sqlite 直连', () => {
  const store = defaultMemoryStore();
  assert.ok(store instanceof SqliteDirectStore);
});
