import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from './llm.js';
import { rewriteQuery } from './query-rewrite.js';

class FakeLLM implements LLMClient {
  constructor(private readonly handler: (messages: ChatMessage[]) => string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    return this.handler(messages);
  }
}

test('rewrite: LLM 返回多条子查询', async () => {
  const llm = new FakeLLM(() =>
    JSON.stringify({ queries: ['STM32F103C8T6 最大主频', 'STM32F103C8T6 72MHz 规格'] }),
  );
  const r = await rewriteQuery('STM32F103C8T6 最大主频是多少', 'factual', llm);
  assert.equal(r.source, 'llm');
  assert.equal(r.queries.length, 2);
});

test('rewrite: LLM 非法输出时保留原 query', async () => {
  const llm = new FakeLLM(() => '不是 JSON');
  const r = await rewriteQuery('STM32F103C8T6 最大主频是多少', 'factual', llm);
  assert.equal(r.source, 'rule');
  assert.deepEqual(r.queries, ['STM32F103C8T6 最大主频是多少']);
});

test('rewrite: 无 LLM 时直接使用原 query', async () => {
  const r = await rewriteQuery('今天A股行情', 'news');
  assert.equal(r.source, 'rule');
  assert.deepEqual(r.queries, ['今天A股行情']);
});
