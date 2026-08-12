import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { shouldTriggerTavily } from './tavily-trigger.js';

test('tavily-trigger: news 意图触发实时查询', () => {
  assert.equal(shouldTriggerTavily('今天A股行情', 'news', false), 'news');
});

test('tavily-trigger: 英文技术查询触发', () => {
  assert.equal(shouldTriggerTavily('STM32F103C8T6 最大主频是多少', 'factual', false), 'english');
});

test('tavily-trigger: 低置信提示触发', () => {
  assert.equal(shouldTriggerTavily('MOSFET 栅极驱动电阻 选型 注意事项', 'experience', false), 'low_confidence_hint');
});

test('tavily-trigger: 严肃通道禁区不触发', () => {
  assert.equal(shouldTriggerTavily('高血压 用药注意事项 禁忌', 'factual', true), null);
});
