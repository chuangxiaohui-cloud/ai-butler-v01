import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { executorStatus } from './executors.js';

test('executors: engineer 已登记，content_writer/calendar/im 未接入', () => {
  assert.equal(executorStatus('engineer'), 'available');
  assert.equal(executorStatus('color_recognition'), 'available');
  assert.equal(executorStatus('document_qa'), 'available');
  assert.equal(executorStatus('image_analysis'), 'available');
  assert.equal(executorStatus('knowledge_qa'), 'available');
  assert.equal(executorStatus('content_writer'), 'available');
  assert.equal(executorStatus('calendar_skill'), 'available');
  assert.equal(executorStatus('im_dispatch'), 'available');
  assert.equal(executorStatus('quote_compare'), 'available');
  assert.equal(executorStatus(undefined), 'available');
});
