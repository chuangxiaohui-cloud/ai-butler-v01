import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isJsonSerializable, validateMcpCall } from './safety.js';
import type { SubAgentMeta } from './types.js';

const meta: SubAgentMeta = {
  id: 'kicad',
  name: 'KiCad',
  category: 'eda',
  toolPrefix: 'kicad.',
  available: true,
  command: [],
};

test('mcp-safety: 工具名必须在子 Agent 前缀白名单内', () => {
  assert.deepEqual(validateMcpCall(meta, 'kicad.run', {}), { ok: true });
  assert.deepEqual(validateMcpCall(meta, 'kicad.sch_export', {}), { ok: true });
  const bad = validateMcpCall(meta, 'keil.compile', {});
  assert.equal(bad.ok, false);
  assert.match(bad.reason ?? '', /白名单/);
  const partial = validateMcpCall(meta, 'kicadX.run', {});
  assert.equal(partial.ok, false, '前缀必须完整匹配到 .');
});

test('mcp-safety: 拒绝非 JSON 可序列化参数', () => {
  assert.deepEqual(validateMcpCall(meta, 'kicad.run', { a: 1, b: 'x', c: [1, 2] }), { ok: true });
  assert.equal(validateMcpCall(meta, 'kicad.run', { fn: () => 1 }).ok, false);
  assert.equal(validateMcpCall(meta, 'kicad.run', { u: undefined }).ok, false);
  assert.equal(validateMcpCall(meta, 'kicad.run', { b: 10n }).ok, false);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(validateMcpCall(meta, 'kicad.run', { cyclic }).ok, false, '循环引用拒绝');
});

test('mcp-safety: isJsonSerializable 精确判定', () => {
  assert.equal(isJsonSerializable(null), true);
  assert.equal(isJsonSerializable('s'), true);
  assert.equal(isJsonSerializable(1.5), true);
  assert.equal(isJsonSerializable(true), true);
  assert.equal(isJsonSerializable([1, 'a', { b: 2 }]), true);
  assert.equal(isJsonSerializable(undefined), false);
  assert.equal(isJsonSerializable(() => 1), false);
  assert.equal(isJsonSerializable(Symbol('x')), false);
  const a: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  a.b = b;
  b.a = a;
  assert.equal(isJsonSerializable(a), false, '间接循环引用拒绝');
});
