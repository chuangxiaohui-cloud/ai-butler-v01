import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { applyRule3 } from './rule3.js';

test('rule3: S02 高血压命中药品关键词', () => {
  const r = applyRule3('高血压 用药注意事项 禁忌');
  assert.equal(r.serious, true);
  assert.ok(r.matched.some((m) => m.startsWith('drug:')));
});

test('rule3: L05 个税命中税率关键词', () => {
  const r = applyRule3('个人所得税 专项附加扣除 怎么申报');
  assert.equal(r.serious, true);
  assert.ok(r.matched.some((m) => m.startsWith('tax:')));
});

test('rule3: E16 排错类不触发', () => {
  const r = applyRule3('ESP32 I2C 通信失败 无应答');
  assert.equal(r.serious, false);
  assert.equal(r.matched.length, 0);
});

test('rule3: 关键词表可配置注入', () => {
  const r = applyRule3('帮我看下 M3 芯片', { custom: ['M3'] });
  assert.equal(r.serious, true);
  assert.equal(r.matched[0], 'custom:M3');
});
