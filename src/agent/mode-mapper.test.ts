import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { mapRouteToUiMode } from './mode-mapper.js';

test('mode-mapper: 工程开发角色映射', () => {
  assert.deepEqual(mapRouteToUiMode('architect', 'execute'), { mode: 'engineering' });
  assert.deepEqual(mapRouteToUiMode('product_manager', 'write_doc'), {
    mode: 'engineering',
    submode: 'product_planning',
  });
  assert.deepEqual(mapRouteToUiMode('project_manager', 'plan'), {
    mode: 'engineering',
    submode: 'review_critique',
  });
  assert.deepEqual(mapRouteToUiMode('owner', 'cost_analysis'), {
    mode: 'engineering',
    submode: 'review_critique',
  });
});

test('mode-mapper: secretary 按意图拆生活/知识', () => {
  assert.deepEqual(mapRouteToUiMode('secretary', 'create_calendar'), { mode: 'life' });
  assert.deepEqual(mapRouteToUiMode('secretary', 'local_query'), { mode: 'life' });
  assert.deepEqual(mapRouteToUiMode('secretary', 'web_search'), { mode: 'knowledge' });
  assert.deepEqual(mapRouteToUiMode('secretary', 'document_qa'), { mode: 'knowledge' });
});
