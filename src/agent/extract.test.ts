import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from '../search/llm.js';
import { extractIntentFeature } from './extract.js';

class FakeLLM implements LLMClient {
  constructor(private readonly handler: (messages: ChatMessage[]) => string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    return this.handler(messages);
  }
}

test('extract: LLM 返回合法 JSON 时走 llm source', async () => {
  const llm = new FakeLLM(() =>
    JSON.stringify({
      actionType: 'create',
      targetDomain: 'code',
      scope: 'project_level',
      requiresExternalSearch: false,
      searchSourceHint: 'none',
      hasImplicitContext: false,
      urgency: 'normal',
      rawEntities: ['App前端'],
      ambiguityFlags: [],
    }),
  );
  const r = await extractIntentFeature('帮我做一个完整的 App 前端', llm);
  assert.equal(r.source, 'llm');
  assert.equal(r.features.actionType, 'create');
  assert.equal(r.features.scope, 'project_level');
});

test('extract: LLM 返回非法 JSON 时走 fallback', async () => {
  const llm = new FakeLLM(() => '不是 JSON');
  const r = await extractIntentFeature('发消息给老张', llm);
  assert.equal(r.source, 'fallback');
  assert.ok(r.issues.length > 0);
  assert.equal(r.features.actionType, 'send');
  assert.equal(r.features.targetDomain, 'message');
});

test('extract: 无 LLM 时走 rule source', async () => {
  const r = await extractIntentFeature('查一下我今天的日程');
  assert.equal(r.source, 'rule');
  assert.equal(r.features.targetDomain, 'schedule');
});
