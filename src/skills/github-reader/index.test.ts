import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { skill } from './index.js';

test('github-reader: 无链接时请求提供仓库链接', async () => {
  const out = await skill.handler('帮我分析一下这个项目');
  assert.ok(out.includes('GitHub 仓库链接'));
});
