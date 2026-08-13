import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PARAMS, PARAM_IDS } from '../../src/config/params.js';

test('PARAM 登记一致性：key↔P-NN 双射、编号唯一且格式合法', () => {
  const keys = Object.keys(PARAMS) as Array<keyof typeof PARAMS>;
  const ids = keys.map((k) => PARAM_IDS[k]);
  assert.equal(new Set(ids).size, ids.length, 'P-NN 编号必须唯一');
  for (const id of ids) assert.match(id, /^P-\d+$/);
  assert.equal(Object.keys(PARAM_IDS).length, keys.length);
});
