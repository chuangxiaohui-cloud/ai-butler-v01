import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { findAvailable, findSubAgent, getSubAgents } from './registry.js';

test('mcp-registry: 预置子 Agent 覆盖四类 + 编译类，默认占位', () => {
  const agents = getSubAgents();
  assert.ok(agents.length >= 6);
  const kicad = findSubAgent('kicad');
  assert.ok(kicad);
  assert.equal(kicad.category, 'eda');
  assert.equal(kicad.toolPrefix, 'kicad.');
  assert.equal(kicad.available, false, '默认未接入');
  assert.deepEqual(kicad.command, [], '无命令 = 占位');

  const categories = new Set<string>(agents.map((meta) => meta.category));
  for (const expected of ['eda', 'structure', 'code', 'simulation', 'build']) {
    assert.ok(categories.has(expected), `应覆盖类别 ${expected}`);
  }
});

test('mcp-registry: findAvailable 只返回已接入，可按类别过滤', () => {
  const all = getSubAgents();
  assert.equal(findAvailable(undefined).length, 0, '默认无已接入');
  // 模拟接入 kicad + keil
  const kicad = findSubAgent('kicad')!;
  const keil = findSubAgent('keil')!;
  (kicad as { available: boolean }).available = true;
  (keil as { available: boolean }).available = true;
  try {
    assert.deepEqual(findAvailable('eda').map((m) => m.id), ['kicad']);
    assert.deepEqual(findAvailable('build').map((m) => m.id), ['keil']);
    assert.equal(findAvailable('structure').length, 0);
  } finally {
    (kicad as { available: boolean }).available = false;
    (keil as { available: boolean }).available = false;
  }
  void all;
});
