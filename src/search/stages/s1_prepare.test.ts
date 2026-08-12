import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  applyJargonMap,
  detectClarify,
  prepareQuery,
  sanitizeQuery,
} from './s1_prepare.js';

test('s1: 黑话映射 Protel → Altium Designer', () => {
  assert.equal(applyJargonMap('Protel 怎么画四层板'), 'Altium Designer 怎么画四层板');
});

test('s1: 脱敏剥离路径、密钥、内网地址', () => {
  const input =
    'M:\\202608111\\project\\main.c 报错，sk-abcdef123456 泄露，内网 192.168.1.10 不通';
  const out = sanitizeQuery(input);
  assert.ok(!out.includes('WorkBuddy_WorkSpace'));
  assert.ok(!out.includes('sk-'));
  assert.ok(!out.includes('192.168'));
  assert.ok(out.includes('报错'));
});

test('s1: 指代不明触发澄清，具体型号不触发', () => {
  assert.ok(detectClarify('这个芯片怎么样？'));
  assert.equal(detectClarify('STM32F103C8T6 怎么样？'), null);
});

test('s1: prepareQuery 生成缓存 key 与澄清槽位', () => {
  const prepared = prepareQuery('这个芯片怎么样？');
  assert.ok(prepared.cacheKey.startsWith('search:'));
  assert.equal(prepared.clarify?.reason, 'pronoun_unresolved');
  assert.equal(prepared.cachedValue, null);
});
