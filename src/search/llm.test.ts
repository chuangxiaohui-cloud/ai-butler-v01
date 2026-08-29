import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PARAMS } from '../config/params.js';
import {
  createDeepReportHeavyClient,
  createOptionalHeavyClient,
  createSkillCompleteClient,
  createSkillHeavyClient,
} from './llm.js';

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

test('llm: 未配置 Provider 时 createDeepReportHeavyClient 返回 undefined', () => {
  const saved = saveKeys();
  for (const key of KEY_ENVS) process.env[key] = '';
  try {
    assert.equal(createDeepReportHeavyClient(), undefined);
  } finally {
    restoreKeys(saved);
  }
});

test('llm: 已配置 Provider 时 createDeepReportHeavyClient 返回可 complete 的客户端（per-call 预算=[P-13]）', () => {
  const saved = saveKeys();
  process.env.DEEPSEEK_API_KEY = 'sk-test-deep-report';
  try {
    const client = createDeepReportHeavyClient();
    assert.ok(client, '已配置 Provider 应返回客户端');
    assert.equal(typeof client.complete, 'function');
  } finally {
    restoreKeys(saved);
  }
});

test('llm: 未配置 Provider 时 createSkillHeavyClient 返回 undefined', () => {
  const saved = saveKeys();
  for (const key of KEY_ENVS) process.env[key] = '';
  try {
    assert.equal(createSkillHeavyClient(), undefined);
  } finally {
    restoreKeys(saved);
  }
});

test('llm: 已配置 Provider 时 createSkillHeavyClient 返回可 complete 的客户端（per-call 预算=[P-122]）', () => {
  const saved = saveKeys();
  process.env.DEEPSEEK_API_KEY = 'sk-test-skill-gen';
  try {
    const client = createSkillHeavyClient();
    assert.ok(client, '已配置 Provider 应返回客户端');
    assert.equal(typeof client.complete, 'function');
  } finally {
    restoreKeys(saved);
  }
});

test('llm: createSkillHeavyClient 单 provider 超时对齐 P-122（避免 v4-pro 30s 被切后兜底到其他 provider）', () => {
  const saved = saveKeys();
  for (const key of KEY_ENVS) process.env[key] = '';
  process.env.DEEPSEEK_API_KEY = 'sk-test-skill-gen';
  try {
    const client = createSkillHeavyClient() as unknown as {
      opts?: { timeoutMs?: number };
      chain?: Array<{ client?: { opts?: { timeoutMs?: number } } }>;
    };
    const timeoutMs = client.opts?.timeoutMs ?? client.chain?.[0]?.client?.opts?.timeoutMs;
    assert.equal(timeoutMs, PARAMS.skillGenerationBudgetMs);
  } finally {
    restoreKeys(saved);
  }
});

const MODEL_ENVS = ['DEEPSEEK_MEDIUM_MODEL', 'DEEPSEEK_HEAVY_MODEL'];

function saveModelEnv(): Map<string, string | undefined> {
  const saved = new Map<string, string | undefined>();
  for (const key of MODEL_ENVS) saved.set(key, process.env[key]);
  return saved;
}

function restoreModelEnv(saved: Map<string, string | undefined>): void {
  for (const key of MODEL_ENVS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('llm: createSkillCompleteClient github-reader 走 medium（v4-flash），其余 skill 维持 heavy（E283）', () => {
  const savedKeys = saveKeys();
  const savedModels = saveModelEnv();
  for (const key of KEY_ENVS) process.env[key] = '';
  process.env.DEEPSEEK_API_KEY = 'sk-test-skill-tier';
  process.env.DEEPSEEK_MEDIUM_MODEL = 'deepseek-v4-flash';
  process.env.DEEPSEEK_HEAVY_MODEL = 'deepseek-v4-pro';
  try {
    const medium = createSkillCompleteClient('github-reader') as unknown as {
      model?: string;
      opts?: { timeoutMs?: number };
      chain?: Array<{ client?: { opts?: { timeoutMs?: number } } }>;
    };
    const heavy = createSkillCompleteClient('engineer') as unknown as { model?: string };
    assert.equal(medium.model, 'deepseek-v4-flash');
    assert.equal(heavy.model, 'deepseek-v4-pro');
    // E283 修订：github-reader 合成预算放宽到 [P-122]（medium 默认 [P-116] 18s 会截断长答案）
    const timeoutMs = medium.opts?.timeoutMs ?? medium.chain?.[0]?.client?.opts?.timeoutMs;
    assert.equal(timeoutMs, PARAMS.skillGenerationBudgetMs);
  } finally {
    restoreKeys(savedKeys);
    restoreModelEnv(savedModels);
  }
});
