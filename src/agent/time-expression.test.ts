import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  detectRepeat,
  extractTimeExpressionOrBare,
  parseRepeatQuery,
  parseTimeExpression,
} from './time-expression.js';

test('time-expression: 明天下午3点', () => {
  const { startAt, label } = parseTimeExpression('明天下午3点');
  const d = new Date(startAt);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(d.getDate(), tomorrow.getDate());
  assert.equal(d.getHours(), 15);
  assert.equal(label, '明天下午3点');
});

test('time-expression: 今天上午10:30', () => {
  const { startAt } = parseTimeExpression('今天上午10:30');
  const d = new Date(startAt);
  assert.equal(d.getHours(), 10);
  assert.equal(d.getMinutes(), 30);
});

test('time-expression: 周三上午10点解析到本周最近周三', () => {
  const { startAt } = parseTimeExpression('周三上午10点');
  const d = new Date(startAt);
  assert.equal(d.getDay(), 3);
  assert.equal(d.getHours(), 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  assert.ok(diffDays >= 0 && diffDays <= 6, `diffDays=${diffDays}`);
});

test('time-expression: 下周一下午3点解析到下一周', () => {
  const { startAt } = parseTimeExpression('下周一下午3点');
  const d = new Date(startAt);
  assert.equal(d.getDay(), 1);
  assert.equal(d.getHours(), 15);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  assert.ok(diffDays >= 7 && diffDays <= 13, `diffDays=${diffDays}`);
});

test('time-expression: 星期天晚上8点', () => {
  const { startAt } = parseTimeExpression('星期天晚上8点');
  const d = new Date(startAt);
  assert.equal(d.getDay(), 0);
  assert.equal(d.getHours(), 20);
});

test('time-expression: detectRepeat 识别每天/每周', () => {
  assert.equal(detectRepeat('每天早上9点提醒我喝水'), 'daily');
  assert.equal(detectRepeat('每周一9点开周会'), 'weekly');
  assert.equal(detectRepeat('明天下午3点开会'), '');
});

test('time-expression: 重复周期 + 纯时间兜底组装', () => {
  assert.equal(extractTimeExpressionOrBare('每天早上9点提醒我喝水', 'daily'), '早上9点');
  assert.equal(extractTimeExpressionOrBare('每周一9点开周会', 'weekly'), '周一9点');
  assert.equal(extractTimeExpressionOrBare('明天下午3点开会', ''), '明天下午3点');
});

test('time-expression: parseRepeatQuery 复杂周期只在时间同段判定', () => {
  assert.equal(parseRepeatQuery('每个工作日9点提醒我打卡').complexPeriod, '工作日');
  assert.equal(parseRepeatQuery('周一到周五9点提醒我').complexPeriod, '周一到周');
  assert.equal(parseRepeatQuery('明天下午3点交每月报告').complexPeriod, undefined);
  assert.equal(parseRepeatQuery('每天早上9点提醒我喝水').repeat, 'daily');
});
