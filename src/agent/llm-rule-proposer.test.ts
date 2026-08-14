import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeV2 } from './router-v2.js';
import { proposeRuleWithLLM } from './llm-rule-proposer.js';
import { ROUTING_TABLE } from './routing-table.js';

const pcbCase = () => {
  const result = routeV2('帮我检查一下这个PCB的安全性');
  return {
    id: 'case-pcb',
    timestamp: 1,
    query: '帮我检查一下这个PCB的安全性',
    result,
    feedback: 'reject' as const,
    correctedRoute: { primaryLens: 'owner', intent: 'risk_review' },
  };
};

test('llm-rule-proposer: 合法 JSON 生成 LLM 候选', async () => {
  const llm = {
    complete: async () =>
      JSON.stringify({
        match: { actionType: 'analyze', targetDomain: 'security' },
        route: { primaryLens: 'owner', intent: 'risk_review' },
        confidenceBoost: 0.15,
      }),
  };
  const candidate = await proposeRuleWithLLM(pcbCase(), llm as never, []);
  assert.ok(candidate);
  assert.deepEqual(candidate?.match, {
    actionType: 'analyze',
    targetDomain: 'security',
  });
  assert.equal(candidate?.primaryLens, 'owner');
  assert.equal(candidate?.intent, 'risk_review');
});

test('llm-rule-proposer: 非法输出回退确定性生成', async () => {
  const llm = { complete: async () => 'not json' };
  const candidate = await proposeRuleWithLLM(pcbCase(), llm as never, []);
  assert.ok(candidate);
  assert.deepEqual(candidate?.match, {
    actionType: 'analyze',
    targetDomain: 'security',
  });
});

test('llm-rule-proposer: 已被现有规则覆盖时丢弃', async () => {
  const llm = {
    complete: async () =>
      JSON.stringify({
        match: {
          actionType: 'analyze',
          targetDomain: 'security',
          scope: 'atomic',
          searchSourceHint: 'none',
        },
        route: { primaryLens: 'owner', intent: 'risk_review' },
        confidenceBoost: 0.15,
      }),
  };
  const candidate = await proposeRuleWithLLM(pcbCase(), llm as never, ROUTING_TABLE);
  assert.equal(candidate, null);
});
