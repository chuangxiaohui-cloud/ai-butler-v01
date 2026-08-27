import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildSelfIdentityAnswer } from './self-identity.js';

test('self-identity: modelSelection 命中目录（deepseek:light）', () => {
  const text = buildSelfIdentityAnswer({ provider: 'deepseek', role: 'light' });
  assert.ok(text.includes('DeepSeek'), '应包含 provider 名');
  assert.ok(text.includes('light 档'), '应包含档位');
  assert.ok(text.includes('模型切换器'), '应给出切换指引');
});

test('self-identity: 未传 selection 走默认档且不含 undefined', () => {
  const text = buildSelfIdentityAnswer(undefined);
  assert.ok(text.includes('AI-Agent'));
  assert.ok(text.includes('档'));
  assert.ok(!text.includes('undefined'));
});
