import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from '../search/llm.js';
import { buildDistillMessages, distillRecord, parseDistill } from './distill.js';

class FakeLLM implements LLMClient {
  constructor(private readonly handler: (messages: ChatMessage[]) => string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    return this.handler(messages);
  }
}

test('distill: 消息构造包含用户问题与 AI 回答', () => {
  const messages = buildDistillMessages('你画板子用什么？', '老板用 Altium Designer。');
  assert.ok(messages[1].content.includes('你画板子用什么'));
  assert.ok(messages[1].content.includes('老板用 Altium Designer'));
});

test('distill: 解析合法 JSON 提取记忆', () => {
  const raw = JSON.stringify([
    { content: '用户（老张）画板子用 Altium Designer', type: 'persona', keywords: ['Altium', '画板'] },
    { content: '垃圾内容', type: 'bogus', keywords: [] },
  ]);
  const result = parseDistill(raw);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'persona');
  assert.ok(result[0].keywords.includes('Altium'));
});

test('distill: 非法输出降级为空', () => {
  assert.equal(parseDistill('不是 JSON').length, 0);
});

test('distill: LLM 异常降级为空且不抛错', async () => {
  const fake = new FakeLLM(() => {
    throw new Error('timeout');
  });
  const result = await distillRecord({ query: 'q', answer: 'a' }, fake);
  assert.equal(result.length, 0);
});
