import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseTimeExpression } from './time-expression.js';

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
