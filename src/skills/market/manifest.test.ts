import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { validateMarketManifest } from './manifest.js';

test('market-manifest: 合法 manifest（含步骤/验证/依赖/权限）通过并归一化', () => {
  const m = validateMarketManifest({
    name: 'pcb-helper',
    version: '0.1.0',
    triggers: ['PCB 布线', ''],
    description: 'PCB 助手',
    steps: ['分析布线', ' 生成建议 '],
    verify: ['输出含关键走线'],
    deps: ['python'],
    permissions: ['none'],
  });
  assert.equal(m.name, 'pcb-helper');
  assert.deepEqual(m.triggers, ['PCB 布线']);
  assert.deepEqual(m.steps, ['分析布线', '生成建议']);
  assert.deepEqual(m.verify, ['输出含关键走线']);
  assert.deepEqual(m.permissions, ['none']);
});

test('market-manifest: 缺 permissions 声明拒绝（§8.2.3 权限声明必填）', () => {
  assert.throws(() => validateMarketManifest({ name: 'x', version: '1', triggers: ['x'] }), /permissions/);
});

test('market-manifest: 非法权限值拒绝', () => {
  assert.throws(
    () => validateMarketManifest({ name: 'x', version: '1', triggers: ['x'], permissions: ['root'] }),
    /非法权限/,
  );
});

test('market-manifest: input: query 通过并归一化', () => {
  const m = validateMarketManifest({ name: 'x', version: '1', triggers: ['x'], permissions: [], input: 'query' });
  assert.equal(m.input, 'query');
});

test('market-manifest: 非法 input 声明拒绝（仅支持 query）', () => {
  assert.throws(
    () => validateMarketManifest({ name: 'x', version: '1', triggers: ['x'], permissions: [], input: 'args' }),
    /非法 input/,
  );
});

test('market-manifest: steps/verify/deps 非字符串数组拒绝', () => {
  assert.throws(
    () => validateMarketManifest({ name: 'x', version: '1', triggers: ['x'], permissions: [], steps: [1] }),
    /steps/,
  );
  assert.throws(
    () => validateMarketManifest({ name: 'x', version: '1', triggers: ['x'], permissions: [], deps: 'python' }),
    /deps/,
  );
});

test('market-manifest: browser 权限必须声明非空 domains（A2/§8.2.3）', () => {
  assert.throws(
    () => validateMarketManifest({ name: 'x', version: '1', triggers: ['x'], permissions: ['browser'] }),
    /domains/,
  );
  assert.throws(
    () => validateMarketManifest({ name: 'x', version: '1', triggers: ['x'], permissions: ['browser'], domains: [] }),
    /domains/,
  );
});

test('market-manifest: browser + domains 通过并归一化为小写', () => {
  const m = validateMarketManifest({
    name: 'x',
    version: '1',
    triggers: ['x'],
    permissions: ['browser'],
    domains: ['SZLCSC.com', 'so.szlcsc.com'],
    actions: ['goto', 'click', 'download'],
  });
  assert.deepEqual(m.domains, ['szlcsc.com', 'so.szlcsc.com']);
  assert.deepEqual(m.actions, ['goto', 'click', 'download']);
});

test('market-manifest: 非法域名格式拒绝', () => {
  assert.throws(
    () =>
      validateMarketManifest({
        name: 'x',
        version: '1',
        triggers: ['x'],
        permissions: ['browser'],
        domains: ['https://szlcsc.com'],
      }),
    /非法域名/,
  );
});

test('market-manifest: browser 与 command 权限互斥；command 禁带 domains（A2）', () => {
  assert.throws(
    () =>
      validateMarketManifest({
        name: 'x',
        version: '1',
        triggers: ['x'],
        permissions: ['browser', 'command'],
        domains: ['szlcsc.com'],
      }),
    /互斥/,
  );
  assert.throws(
    () =>
      validateMarketManifest({
        name: 'x',
        version: '1',
        triggers: ['x'],
        permissions: ['command'],
        domains: ['szlcsc.com'],
      }),
    /互斥/,
  );
});

test('market-manifest: actions 非法值拒绝；非 browser 权限禁带', () => {
  assert.throws(
    () =>
      validateMarketManifest({
        name: 'x',
        version: '1',
        triggers: ['x'],
        permissions: ['browser'],
        domains: ['szlcsc.com'],
        actions: ['execute_js'],
      }),
    /非法动作/,
  );
  assert.throws(
    () =>
      validateMarketManifest({
        name: 'x',
        version: '1',
        triggers: ['x'],
        permissions: ['none'],
        actions: ['goto'],
      }),
    /actions 仅在 browser/,
  );
});
