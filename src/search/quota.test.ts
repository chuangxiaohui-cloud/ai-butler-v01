import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { FileQuotaStore } from './quota.js';

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quota-test-'));
  return join(dir, 'search-quota.json');
}

test('quota: 同日计数并在达限后拒绝', async () => {
  const file = tempFile();
  try {
    const store = new FileQuotaStore(file);
    assert.equal(await store.take('bocha', 2), true);
    assert.equal(await store.take('bocha', 2), true);
    assert.equal(await store.take('bocha', 2), false);
    const state = JSON.parse(readFileSync(file, 'utf-8')) as { counts: Record<string, number> };
    assert.equal(state.counts.bocha, 2);
  } finally {
    rmSync(file, { force: true });
  }
});

test('quota: 不同 key 独立计数', async () => {
  const file = tempFile();
  try {
    const store = new FileQuotaStore(file);
    assert.equal(await store.take('bocha', 1), true);
    assert.equal(await store.take('anysearch', 1), true);
    assert.equal(await store.take('bocha', 1), false);
    assert.equal(await store.take('anysearch', 1), false);
  } finally {
    rmSync(file, { force: true });
  }
});
