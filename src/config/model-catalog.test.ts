import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildModelCatalog } from './model-catalog.js';

test('model-catalog: 导出聊天档 + 视觉档（deepseek:vision 实体模型名）', () => {
  const catalog = buildModelCatalog();
  const vision = catalog.models.find((m) => m.id === 'deepseek:vision');
  assert.ok(vision, '应有 deepseek:vision');
  assert.equal(vision?.label, 'deepseek-v4-flash-vision-exp');
  assert.equal(vision?.note, '视觉');
  assert.deepEqual(
    [...new Set(catalog.models.map((m) => m.id.split(':')[1]))].sort(),
    ['heavy', 'light', 'medium', 'vision'],
    '目录应覆盖 light/medium/heavy/vision 四档',
  );
});
