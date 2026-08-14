import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { ChatMessage, LLMClient } from './llm.js';
import { rewriteQuery, ruleBasedRewrite } from './query-rewrite.js';

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
  assert.equal(r.queries.length, 5);
  assert.ok(r.queries.includes('STM32F103C8T6 最大主频'));
  assert.ok(r.queries.includes('STM32F103C8T6 72MHz 规格'));
});

test('rewrite: LLM 非法输出时保留原 query', async () => {
  const llm = new FakeLLM(() => '不是 JSON');
  const r = await rewriteQuery('Python是什么语言', 'factual', llm);
  assert.equal(r.source, 'rule');
  assert.deepEqual(r.queries, ['Python是什么语言']);
});

test('rewrite: 无 LLM 时保留原 query', async () => {
  const r = await rewriteQuery('Python是什么语言', 'factual');
  assert.equal(r.source, 'rule');
  assert.deepEqual(r.queries, ['Python是什么语言']);
});

test('rewrite: news 无 LLM 时补充年份与最新', async () => {
  const r = await rewriteQuery('今天A股行情', 'news');
  assert.equal(r.source, 'rule');
  assert.ok(r.queries[0].includes('最新'));
  assert.match(r.queries[0], /20\d{2}/);
});

test('rewrite: 型号代码+手机触发精确改写', () => {
  const queries = ruleBasedRewrite('MRT-AL10手机');
  assert.ok(queries[0].includes('MRT-AL10 入网型号 对应手机型号'));
  assert.ok(queries[1].includes('MRT-AL10 手机型号'));
});

test('rewrite: 器件型号自动补官方源子查询', () => {
  const queries = ruleBasedRewrite('STM32F103C8T6 最大主频是多少');
  assert.ok(queries[0].includes('site:st.com'));
  assert.ok(queries[1].includes('st.com 官方 数据手册'));
  assert.ok(queries.includes('STM32F103C8T6 最大主频是多少'));
});

test('rewrite: 软件最新版本优先查 GitHub release 与 npm', () => {
  const queries = ruleBasedRewrite('openclaw最新版本号是多少');
  assert.ok(queries[0].includes('openclaw GitHub release latest version'));
  assert.ok(queries[1].includes('openclaw npm latest version'));
  assert.ok(queries.includes('openclaw最新版本号是多少'));
});

test('rewrite: 世界杯战报生成赛事精确改写', () => {
  const queries = ruleBasedRewrite('世界杯战报', 'news');
  assert.ok(queries[0].includes('决赛 比分 冠军'));
  assert.ok(!queries[0].includes('战报'));
  assert.ok(queries[1].includes('赛果 比分 冠军'));
  assert.ok(queries.some((q) => /20\d{2}/.test(q)));
});

test('rewrite: 无 LLM 时手机型号仍走精确改写', async () => {
  const r = await rewriteQuery('MRT-AL10手机', 'factual');
  assert.equal(r.source, 'rule');
  assert.equal(r.queries[0], 'MRT-AL10 入网型号 对应手机型号');
});
