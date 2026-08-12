import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { SqliteDirectStore } from './store.js';

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
