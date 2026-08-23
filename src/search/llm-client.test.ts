import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { OpenAiCompatibleClient } from './llm-client.js';

describe('llm-client: 外部取消信号（P17 总预算透传）', () => {
  const makeClient = () =>
    new OpenAiCompatibleClient({
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: 'sk-test',
      model: 'test-model',
      timeoutMs: 30_000,
      provider: 'test',
    });

  it('已中止的 signal 立即拒绝，不发网络请求', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = makeClient();
    await assert.rejects(
      () => client.complete([{ role: 'user', content: 'hi' }], { signal: controller.signal }),
      (err: unknown) => err instanceof Error && err.name === 'AbortError',
    );
  });
});
