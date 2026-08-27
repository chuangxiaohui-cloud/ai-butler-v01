import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildSelfIdentityAnswer } from './self-identity.js';

test('self-identity: modelSelection 命中目录（deepseek:light）', () => {
  const text = buildSelfIdentityAnswer({ provider: 'deepseek', role: 'light' });
  assert.ok(text.includes('DeepSeek'), '应包含 provider 名');
  assert.ok(text.includes('light 档'), '应包含档位');
  assert.ok(text.includes('模型切换器'), '应给出切换指引');
  assert.ok(text.includes('不消耗模型调用额度'), '应说明身份问答不耗模型额度');
});

test('self-identity: 未传 selection 走默认档且不含 undefined', () => {
  const text = buildSelfIdentityAnswer(undefined);
  assert.ok(text.includes('AI-Agent'));
  assert.ok(text.includes('档'));
  assert.ok(!text.includes('undefined'));
});

test('self-identity: heavy/medium 档返回实体模型名（与 .env 配置一致）', () => {
  const heavy = buildSelfIdentityAnswer({ provider: 'deepseek', role: 'heavy' });
  assert.ok(heavy.includes('deepseek-v4-pro'), 'heavy 应为 deepseek-v4-pro');
  assert.ok(heavy.includes('heavy 档'), '应包含 heavy 档');
  const medium = buildSelfIdentityAnswer({ provider: 'deepseek', role: 'medium' });
  assert.ok(medium.includes('deepseek-v4-flash'), 'medium 应为 deepseek-v4-flash');
  assert.ok(medium.includes('medium 档'), '应包含 medium 档');
});
