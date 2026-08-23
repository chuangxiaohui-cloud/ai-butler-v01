import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { createOptionalHeavyClient } from './llm.js';

const KEY_ENVS = ['DEEPSEEK_API_KEY', 'LLM_PRIMARY_API_KEY', 'MINIMAX_API_KEY', 'ZHIPU_API_KEY'];

function saveKeys(): Map<string, string | undefined> {
  const saved = new Map<string, string | undefined>();
  for (const key of KEY_ENVS) saved.set(key, process.env[key]);
  return saved;
}

function restoreKeys(saved: Map<string, string | undefined>): void {
  for (const key of KEY_ENVS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('llm: 未配置 Provider 时 createOptionalHeavyClient 返回 undefined（规则路由，无 [P-84] 折扣）', () => {
  // 置空而非删除：registry 构造会 loadEnvFile（幂等，只补 undefined 键），置空可阻止 .env 回填
  const saved = saveKeys();
  for (const key of KEY_ENVS) process.env[key] = '';
  try {
    assert.equal(createOptionalHeavyClient(), undefined);
  } finally {
    restoreKeys(saved);
  }
});

test('llm: 已配置 Provider 时返回可 complete 的客户端（LLM 增强路由启用）', () => {
  const saved = saveKeys();
  process.env.DEEPSEEK_API_KEY = 'sk-test-optional-heavy';
  try {
    const client = createOptionalHeavyClient();
    assert.ok(client, '已配置 Provider 应返回客户端');
    assert.equal(typeof client.complete, 'function');
  } finally {
    restoreKeys(saved);
  }
});
