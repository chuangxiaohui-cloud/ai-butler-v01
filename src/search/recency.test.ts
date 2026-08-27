import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isRecencySensitiveQuery } from './recency.js';

test('recency: 当前状态问题判定为强时效', () => {
  assert.equal(isRecencySensitiveQuery('中国空间站现在有哪几个航天员在太空'), true);
  assert.equal(isRecencySensitiveQuery('今天A股行情'), true);
  assert.equal(isRecencySensitiveQuery('STM32F103C8T6 最大主频是多少'), false);
});

test('recency: 市值/排名/价格类强时效问题判定为强时效（E270 补 E81 词表）', () => {
  assert.equal(isRecencySensitiveQuery('中国AI大模型公司中市值较高的是哪几家'), true);
  assert.equal(isRecencySensitiveQuery('全球芯片公司市值排名'), true);
  assert.equal(isRecencySensitiveQuery('STM32F103C8T6 价格'), true);
});
