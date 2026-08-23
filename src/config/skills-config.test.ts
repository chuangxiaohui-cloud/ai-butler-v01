import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readDisabledSkills, writeDisabledSkills } from './skills-config.js';

test('skills-config: 读写禁用列表', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skills-config-'));
  const file = join(dir, 'skills-config.json');
  try {
    assert.deepEqual([...readDisabledSkills(file)], []);
    writeDisabledSkills(['calendar-skill'], file);
    assert.deepEqual([...readDisabledSkills(file)], ['calendar-skill']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skills-config: H8 缓存复用与 mtime 失效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skills-config-cache-'));
  const file = join(dir, 'skills-config.json');
  try {
    writeDisabledSkills(['a-skill'], file);
    const first = readDisabledSkills(file);
    const second = readDisabledSkills(file);
    assert.equal(first, second, 'mtime 未变时应命中缓存（同一 Set 实例）');
    assert.deepEqual([...first], ['a-skill']);

    // 外部直接改写文件（不经 writeDisabledSkills），mtime 变化后读到新值
    writeFileSync(file, JSON.stringify({ disabled: ['b-skill'] }), 'utf-8');
    const base = statSync(file).mtimeMs;
    utimesSync(file, new Date(base / 1000 + 60), new Date(base / 1000 + 60));
    const third = readDisabledSkills(file);
    assert.notEqual(third, first, '外部写入后 mtime 变化 → 重新读取');
    assert.deepEqual([...third], ['b-skill']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
