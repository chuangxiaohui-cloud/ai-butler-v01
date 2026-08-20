import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from '../search/llm.js';
import { extractRewriteSource, rewriteWithMemory } from './rewrite-with-memory.js';

class FakeLLM implements LLMClient {
  lastPrompt = '';

  constructor(private readonly answer: string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    this.lastPrompt = messages[0]?.content ?? '';
    return this.answer;
  }
}

test('rewrite-with-memory: 从当前指令内取原文', () => {
  const source = extractRewriteSource('润色这段话：这个方案还行，就是报价有点高。');
  assert.equal(source, '这个方案还行，就是报价有点高。');
});

test('rewrite-with-memory: 从近期 Q+A 记忆取原文', () => {
  const source = extractRewriteSource('把刚才那段话，用更专业的语气重写一遍。', [
    'Q: 这段话：这个方案我觉得还行，就是报价有点高。 → A: 老板，方案本身认可。',
    'Q: 帮我写 PID。 → A: # PID',
  ]);
  assert.equal(source, '这段话：这个方案我觉得还行，就是报价有点高。');
});

test('rewrite-with-memory: 无原文返回 null', () => {
  assert.equal(extractRewriteSource('帮我润色一下。', []), null);
});

test('rewrite-with-memory: 有原文且有 LLM 时输出润色结果', async () => {
  const llm = new FakeLLM('该方案整体可行，不过报价仍有优化空间。');
  const out = await rewriteWithMemory(
    '把刚才那段话，用更专业的语气重写一遍。',
    ['Q: 这段话：这个方案我觉得还行，就是报价有点高。 → A: 老板，方案本身认可。'],
    llm,
  );
  assert.equal(out, '该方案整体可行，不过报价仍有优化空间。');
  assert.ok(llm.lastPrompt.includes('这个方案我觉得还行'));
});

test('rewrite-with-memory: 无 LLM 时返回 null', async () => {
  const out = await rewriteWithMemory(
    '把刚才那段话，用更专业的语气重写一遍。',
    ['Q: 这段话：这个方案我觉得还行，就是报价有点高。 → A: 老板，方案本身认可。'],
    undefined,
  );
  assert.equal(out, null);
});
