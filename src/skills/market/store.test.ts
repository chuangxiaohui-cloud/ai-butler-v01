import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl } from '../../log/jsonl.js';
import { MarketStore } from './store.js';
import type { MarketInstallRecord } from './types.js';

function tmpPath() {
  const dir = mkdtempSync(join(tmpdir(), 'market-store-'));
  return { dir, file: join(dir, 'installs.jsonl') };
}

function record(name: string, status: 'installed' | 'disabled' = 'installed'): MarketInstallRecord {
  return {
    ts: '2026-08-23T00:00:00.000Z',
    name,
    version: '0.1.0',
    sourceUrl: 'https://github.com/x/y',
    checksum: 'abc',
    permissions: [],
    status,
  };
}

test('market-store: record/list/latest/statusOf 基础读写', () => {
  const { dir, file } = tmpPath();
  try {
    const store = new MarketStore(file);
    store.record(record('pcb-helper'));
    assert.equal(store.statusOf('pcb-helper'), 'installed');
    assert.equal(store.latest('pcb-helper')?.checksum, 'abc');
    assert.equal(store.statusOf('unknown'), 'unknown');
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('market-store: markDisabled 追加记录保留历史，最新状态生效', () => {
  const { dir, file } = tmpPath();
  try {
    const store = new MarketStore(file);
    store.record(record('pcb-helper'));
    store.markDisabled('pcb-helper');
    assert.equal(store.statusOf('pcb-helper'), 'disabled');
    assert.equal(store.list().length, 2, '记录保留（不静默删除）');
    assert.equal(store.installed().length, 0);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('market-store: installed() 只含最新状态为 installed 的记录', () => {
  const { dir, file } = tmpPath();
  try {
    const store = new MarketStore(file);
    store.record(record('a'));
    store.record(record('b'));
    store.markDisabled('a');
    const installed = store.installed().map((r) => r.name);
    assert.deepEqual(installed, ['b']);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('market-store: 损坏行忽略，不阻塞读取', () => {
  const { dir, file } = tmpPath();
  try {
    const store = new MarketStore(file);
    store.record(record('a'));
    appendFileSync(file, 'not-json\n');
    const reloaded = new MarketStore(file);
    assert.equal(reloaded.statusOf('a'), 'installed');
    assert.equal(reloaded.list().length, 1);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});
