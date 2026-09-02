import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  detectTravelIntent,
  formatProactiveSuggestions,
  proactiveSuggestions,
} from './proactive.js';

test('proactive: 日期+地点 → 差旅建议（E313）', () => {
  const suggestions = proactiveSuggestions('下周三要去深圳见供应商');
  assert.ok(suggestions.some((s) => s.id === 'travel'));
  assert.ok(detectTravelIntent('下周三要去深圳见供应商'));
});

test('proactive: 提到报销 → 报销单模板建议（E313）', () => {
  const suggestions = proactiveSuggestions('这次采购的费用要报销一下');
  assert.ok(suggestions.some((s) => s.id === 'reimbursement'));
});

test('proactive: 提到开会 → 会议安排建议（E313）', () => {
  const suggestions = proactiveSuggestions('下午和架构师开个评审会');
  assert.ok(suggestions.some((s) => s.id === 'meeting'));
});

test('proactive: 连续工作≥2h → 提醒休息（文本/参数两路）', () => {
  const byText = proactiveSuggestions('我已经连续工作 3 小时了');
  assert.ok(byText.some((s) => s.id === 'rest'));
  const byOpts = proactiveSuggestions('今天进度汇报', { workedMinutes: 150 });
  assert.ok(byOpts.some((s) => s.id === 'rest'));
  const under = proactiveSuggestions('连续工作 1 小时');
  assert.ok(!under.some((s) => s.id === 'rest'));
});

test('proactive: 无命中返回空数组', () => {
  assert.deepEqual(proactiveSuggestions('STM32 最大主频是多少'), []);
});

test('proactive: 格式化输出仅建议、不自动执行（红线 §2.3）', () => {
  const text = formatProactiveSuggestions(proactiveSuggestions('明天去北京出差'));
  assert.ok(text.startsWith('💡 主动建议'));
  assert.ok(text.includes('仅建议、不自动执行'));
  assert.ok(text.includes('要不要'));
  assert.equal(formatProactiveSuggestions([]), '');
});
