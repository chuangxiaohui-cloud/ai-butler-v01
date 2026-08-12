import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { clearSessionL0 } from './memorycore-cleaner.js';

test('memorycore-cleaner: 按 session 过滤 JSONL 并保留其他行', () => {
  const dir = mkdtempSync(join(tmpdir(), 'memorycore-cleaner-'));
  const convDir = join(dir, 'conversations');
  mkdirSync(convDir);
  const lines = [
    JSON.stringify({ id: 'm1', sessionId: 's1', role: 'user', content: 'a' }),
    JSON.stringify({ id: 'm2', sessionId: 's1', role: 'assistant', content: 'b' }),
    JSON.stringify({ id: 'm3', sessionId: 's2', role: 'user', content: 'c' }),
  ];
  writeFileSync(join(convDir, '2026-08-13.jsonl'), `${lines.join('\n')}\n`, 'utf-8');
  try {
    const r = clearSessionL0('s1', dir);
    assert.equal(r.deleted, 2);
    const after = readFileSync(join(convDir, '2026-08-13.jsonl'), 'utf-8').trim();
    assert.equal(after, lines[2]);
    const backups = readdirSync(join(convDir, '.bak'));
    assert.equal(backups.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
