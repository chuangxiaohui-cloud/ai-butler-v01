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
