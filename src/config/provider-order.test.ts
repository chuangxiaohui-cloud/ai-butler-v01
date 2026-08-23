import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readProviderOrder, writeProviderOrder } from './provider-order.js';

test('provider-order: 缺失文件返回 null', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'po-test-')), 'provider-order.json');
  assert.equal(readProviderOrder(file), null);
  rmSync(file, { force: true });
});

test('provider-order: 写入后读到新顺序，写后缓存失效（P3）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'po-test-'));
  const file = join(dir, 'provider-order.json');
  try {
    writeProviderOrder(['zhipu', 'deepseek'], file);
    assert.deepEqual(readProviderOrder(file), ['zhipu', 'deepseek']);
    // mtime 未变：缓存命中，结果一致
    assert.deepEqual(readProviderOrder(file), ['zhipu', 'deepseek']);
    // 再次写入 → 显式失效缓存 → 读到新值
    writeProviderOrder(['deepseek'], file);
    assert.deepEqual(readProviderOrder(file), ['deepseek']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('provider-order: 外部修改文件（mtime 变化）可被感知（P3）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'po-test-'));
  const file = join(dir, 'provider-order.json');
  try {
    writeProviderOrder(['deepseek'], file);
    assert.deepEqual(readProviderOrder(file), ['deepseek']);
    await new Promise((resolve) => setTimeout(resolve, 5));
    writeFileSync(file, `${JSON.stringify({ order: ['minimax'] }, null, 2)}\n`, 'utf-8');
    assert.deepEqual(readProviderOrder(file), ['minimax']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});