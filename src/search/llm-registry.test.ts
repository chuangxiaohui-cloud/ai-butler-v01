import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultRegistry,
  FallbackLLMClient,
  LlmProviderRegistry,
} from './llm-registry.js';
import type { ChatMessage, LLMClient } from './llm-client.js';

function clientReturning(value: string): LLMClient {
  return {
    async complete(messages: ChatMessage[]): Promise<string> {
      return `${value}:${messages.length}`;
    },
  };
}

function clientThrowing(message: string): LLMClient {
  return {
    async complete(): Promise<string> {
      throw new Error(message);
    },
  };
}

function clientHanging(): LLMClient {
  return {
    async complete(): Promise<string> {
      return await new Promise<never>(() => {});
    },
  };
}

describe('llm-registry: provider 选择', () => {
  it('仅 DeepSeek key 时 heavy 档解析到 DeepSeek', () => {
    const registry = new LlmProviderRegistry({
      DEEPSEEK_API_KEY: 'sk-deepseek',
    });
    const profile = registry.resolveProfile('heavy');
    assert.ok(profile);
    assert.equal(profile.id, 'deepseek');
    assert.equal(profile.models.heavy, 'deepseek-chat');
  });

  it('LLM_PROVIDER_ORDER 控制便宜优先顺序', () => {
    const registry = new LlmProviderRegistry({
      LLM_PROVIDER_ORDER: 'minimax,deepseek',
      DEEPSEEK_API_KEY: 'sk-deepseek',
      MINIMAX_API_KEY: 'sk-minimax',
    });
    const profile = registry.resolveProfile('heavy');
    assert.ok(profile);
    assert.equal(profile.id, 'minimax');
    assert.equal(profile.models.heavy, 'MiniMax-M3');
    const light = registry.resolveProfile('light');
    assert.ok(light);
    assert.equal(light.models.light, 'MiniMax-M2.7-highspeed');
    const medium = registry.resolveProfile('medium');
    assert.ok(medium);
    assert.equal(medium.models.medium, 'MiniMax-M2.7');
  });

  it('旧 LLM_PRIMARY_* 配置仍解析为 legacy profile', () => {
    const registry = new LlmProviderRegistry({
      LLM_PRIMARY_API_KEY: 'sk-legacy',
      LLM_PRIMARY_BASE_URL: 'https://legacy.example.com/v1',
      LLM_HEAVY_MODEL: 'custom-heavy',
    });
    const profile = registry.resolveProfile('heavy');
    assert.ok(profile);
    assert.equal(profile.id, 'legacy');
    assert.equal(profile.baseUrl, 'https://legacy.example.com/v1');
    assert.equal(profile.models.heavy, 'custom-heavy');
  });

  it('defaultRegistry 返回同一实例（P3 单例缓存）', () => {
    assert.equal(defaultRegistry(), defaultRegistry());
  });

  it('无任何 key 时抛出明确错误', () => {
    const registry = new LlmProviderRegistry({});
    assert.throws(() => registry.createForRole('heavy'), /未配置 heavy 模型 Provider/);
  });
});

describe('llm-registry: fallback 链', () => {
  it('primary 失败自动切换 secondary 并回调', async () => {
    const events: Array<{ from: string; to: string }> = [];
    const client = new FallbackLLMClient(
      [
        { providerId: 'deepseek', model: 'deepseek-chat', client: clientThrowing('timeout') },
        { providerId: 'zhipu', model: 'glm-5.2', client: clientReturning('ok') },
      ],
      (from, to) => events.push({ from, to }),
    );
    const answer = await client.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(answer, 'ok:1');
    assert.deepEqual(events, [{ from: 'deepseek', to: 'zhipu' }]);
    assert.deepEqual(client.describe(), {
      provider: 'zhipu',
      model: 'glm-5.2',
      fallbacks: [{ from: 'deepseek', to: 'zhipu' }],
    });
  });

  it('全部失败时抛出最后错误', async () => {
    const client = new FallbackLLMClient([
      { providerId: 'deepseek', model: 'deepseek-chat', client: clientThrowing('a') },
      { providerId: 'zhipu', model: 'glm-5.2', client: clientThrowing('b') },
    ]);
    await assert.rejects(() => client.complete([{ role: 'user', content: 'hi' }]), /b/);
  });

  it('总预算超时立即终止，不再尝试后续 provider（P17）', async () => {
    let secondCalled = false;
    const client = new FallbackLLMClient(
      [
        { providerId: 'deepseek', model: 'deepseek-chat', client: clientHanging() },
        {
          providerId: 'zhipu',
          model: 'glm-5.2',
          client: {
            async complete(): Promise<string> {
              secondCalled = true;
              return 'ok';
            },
          },
        },
      ],
      undefined,
      60,
    );
    const start = Date.now();
    await assert.rejects(() => client.complete([{ role: 'user', content: 'hi' }]), /总预算/);
    assert.ok(Date.now() - start < 2000, '不能等 client 自身超时（P17 总预算生效）');
    assert.equal(secondCalled, false);
  });

  it('预算内首 provider 失败仍正常兜底（P17）', async () => {
    const client = new FallbackLLMClient(
      [
        { providerId: 'deepseek', model: 'deepseek-chat', client: clientThrowing('timeout') },
        { providerId: 'zhipu', model: 'glm-5.2', client: clientReturning('ok') },
      ],
      undefined,
      1000,
    );
    const answer = await client.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(answer, 'ok:1');
    assert.equal(client.describe()?.provider, 'zhipu');
  });
});
