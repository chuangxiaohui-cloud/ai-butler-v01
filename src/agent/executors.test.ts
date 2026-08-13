import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { executorStatus } from './executors.js';

test('executors: engineer 已登记，content_writer/calendar/im 未接入', () => {
  assert.equal(executorStatus('engineer'), 'available');
  assert.equal(executorStatus('content_writer'), 'not_wired');
  assert.equal(executorStatus('calendar_skill'), 'not_wired');
  assert.equal(executorStatus('im_dispatch'), 'not_wired');
  assert.equal(executorStatus(undefined), 'available');
});
