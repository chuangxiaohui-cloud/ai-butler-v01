import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  appendJsonl,
  clearJsonlReadCache,
  closeJsonl,
  readJsonlCached,
} from './jsonl.js';

test('jsonl: 追加读回 + 缓存随写入失效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsonl-append-'));
  const file = join(dir, 'events.jsonl');
  try {
    clearJsonlReadCache();
    // 文件缺失返回空数组
    assert.deepEqual(readJsonlCached(file, (line) => line), []);
    appendJsonl(file, 'a');
    appendJsonl(file, 'b');
    assert.deepEqual(readJsonlCached(file, (line) => line), ['a', 'b']);
    // 同 key（mtime+size 未变）命中缓存，返回相同内容
    assert.deepEqual(readJsonlCached(file, (line) => line), ['a', 'b']);
    // 追加后 size 变化，缓存失效重读
    appendJsonl(file, 'c');
    assert.deepEqual(readJsonlCached(file, (line) => line), ['a', 'b', 'c']);
    // 自定义解析：跳过非法行
    assert.equal(
      readJsonlCached(file, (line) => (line === 'b' ? line : null)).length,
      1,
    );
    // 落盘行数一致
    const raw = readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    assert.equal(raw.length, 3);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('jsonl: 小上限轮转出 .1 归档，主文件继续追加', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsonl-rotate-'));
  const file = join(dir, 'events.jsonl');
  try {
    clearJsonlReadCache();
    appendJsonl(file, 'x1', 10);
    appendJsonl(file, 'x2', 10);
    appendJsonl(file, 'x3', 10); // 累计 9 字节，未触发轮转
    appendJsonl(file, 'x4', 10); // 12 > 10，轮转：x1-x3 归档
    assert.deepEqual(readJsonlCached(file, (line) => line), ['x4']);
    const archived = readFileSync(`${file}.1`, 'utf-8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    assert.deepEqual(archived, ['x1', 'x2', 'x3']);
    // 继续追加到新主文件
    appendJsonl(file, 'x5', 10);
    assert.deepEqual(readJsonlCached(file, (line) => line), ['x4', 'x5']);
    // 再次超限：主文件 x4-x6 归档（覆盖旧 .1），只保留一份
    appendJsonl(file, 'x6', 10);
    appendJsonl(file, 'x7', 10); // 12 > 10，再次轮转
    assert.deepEqual(readJsonlCached(file, (line) => line), ['x7']);
    const archived2 = readFileSync(`${file}.1`, 'utf-8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    assert.deepEqual(archived2, ['x4', 'x5', 'x6']);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});