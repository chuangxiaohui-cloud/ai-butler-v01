import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { findAvailable, findSubAgent, getSubAgents } from './registry.js';

test('mcp-registry: 预置子 Agent 覆盖专业类别且 VS Code 默认占位', () => {
  const agents = getSubAgents();
  assert.ok(agents.length >= 6);
  const kicad = findSubAgent('kicad');
  assert.ok(kicad);
  assert.equal(kicad.category, 'eda');
  assert.equal(kicad.toolPrefix, 'kicad.');
  assert.equal(kicad.available, false, '默认未接入');
  assert.deepEqual(kicad.command, [], '无命令 = 占位');

  const vscode = findSubAgent('vscode');
  assert.ok(vscode);
  assert.equal(vscode.name, 'Visual Studio Code');
  assert.equal(vscode.category, 'code');
  assert.equal(vscode.toolPrefix, 'vscode.');
  assert.equal(vscode.available, false, 'VS Code 未配置真实连接时保持占位');
  assert.deepEqual(vscode.command, []);

  const stm32Gcc = findSubAgent('stm32-gcc');
  assert.ok(stm32Gcc);
  assert.equal(stm32Gcc.category, 'build');
  assert.equal(stm32Gcc.toolPrefix, 'stm32-gcc.');
  assert.equal(stm32Gcc.available, false);

  const ltspice = findSubAgent('ltspice');
  assert.ok(ltspice);
  assert.equal(ltspice.category, 'simulation');
  assert.equal(ltspice.toolPrefix, 'ltspice.');
  assert.equal(ltspice.available, false);

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
