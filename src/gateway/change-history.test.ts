import { strict as assert } from 'node:assert';
import { test, beforeEach } from 'node:test';

import {
  CHANGE_HISTORY_MAX,
  clearProjectChangeHistory,
  listProjectChangeRecords,
  recordProjectChanges,
} from './change-history.js';

beforeEach(() => clearProjectChangeHistory());

test('E339 change-history: 记录差量且新记录在最前，返回副本', () => {
  recordProjectChanges([{ path: 'projects/a.txt', kind: 'added' }], 1000);
  recordProjectChanges([{ path: 'projects/b.txt', kind: 'modified' }], 2000);
  const out = listProjectChangeRecords();
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { path: 'projects/b.txt', kind: 'modified', at: 2000 });
  assert.deepEqual(out[1], { path: 'projects/a.txt', kind: 'added', at: 1000 });
  // 返回副本：外部改动不污染内存环
  out[0].path = 'projects/hacked.txt';
  assert.equal(listProjectChangeRecords()[0].path, 'projects/b.txt');
});

test('E339 change-history: 一次差量含多文件按原序保留，removed 也记录', () => {
  recordProjectChanges([
    { path: 'projects/x.txt', kind: 'removed' },
    { path: 'projects/y.txt', kind: 'added' },
  ], 3000);
  const out = listProjectChangeRecords();
  assert.equal(out.length, 2);
  assert.equal(out[0].path, 'projects/x.txt');
  assert.equal(out[0].kind, 'removed');
  assert.equal(out[1].path, 'projects/y.txt');
});

test('E339 change-history: 超出上限截断保留最新 + 空记录不动作', () => {
  // 空入参
  recordProjectChanges([], 4000);
  assert.equal(listProjectChangeRecords().length, 0);
  // 超上限
  for (let i = 1; i <= CHANGE_HISTORY_MAX + 10; i += 1) {
    recordProjectChanges([{ path: 'projects/f' + i + '.txt', kind: 'added' }], i);
  }
  const out = listProjectChangeRecords();
  assert.equal(out.length, CHANGE_HISTORY_MAX);
  // 最旧 10 条被丢弃，保留的是最新 50 条
  assert.equal(out[out.length - 1].at, 11);
  assert.equal(out[0].at, CHANGE_HISTORY_MAX + 10);
});
