import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { OpenAiCompatibleClient, stripThinkBlock } from './llm-client.js';

describe('llm-client: stripThinkBlock（deepseek 思考块剥离，E238）', () => {
  it('剥离前导 <think> 推理块', () => {
    assert.equal(stripThinkBlock('<think>推理过程</think>\n\n最终答案'), '最终答案');
  });
  it('无 think 块时原样返回', () => {
    assert.equal(stripThinkBlock('普通答案'), '普通答案');
  });
  it('只有 think 块时保留原文避免空答案', () => {
    assert.equal(stripThinkBlock('<think>只有推理</think>'), '<think>只有推理</think>');
  });
});

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
