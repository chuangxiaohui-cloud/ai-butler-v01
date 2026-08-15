import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isRecencySensitiveQuery } from './recency.js';

test('recency: 当前状态问题判定为强时效', () => {
  assert.equal(isRecencySensitiveQuery('中国空间站现在有哪几个航天员在太空'), true);
  assert.equal(isRecencySensitiveQuery('今天A股行情'), true);
  assert.equal(isRecencySensitiveQuery('STM32F103C8T6 最大主频是多少'), false);
});
