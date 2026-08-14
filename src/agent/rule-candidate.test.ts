import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeV2 } from './router-v2.js';
import { generateRuleCandidates } from './rule-candidate.js';
import { ROUTING_TABLE } from './routing-table.js';

test('rule-candidate: reject + correctedRoute 生成候选，跳过已有规则', () => {
  const base = routeV2('帮我改一下这份方案');
  const records = [
    {
      id: 'case-1',
      timestamp: 1,
      query: '帮我改一下这份方案',
      result: base,
      feedback: 'reject' as const,
      correctedRoute: { primaryLens: 'product_manager', intent: 'write_doc' },
    },
  ];
  const candidates = generateRuleCandidates(records);
  assert.ok(candidates.length >= 1);
  assert.equal(candidates[0].primaryLens, 'product_manager');
  assert.equal(candidates[0].intent, 'write_doc');
  assert.equal(candidates[0].status, 'proposed');
});

test('rule-candidate: 与现有规则完全重复时跳过', () => {
  const base = routeV2('帮我写一份 PRD');
  const records = [
    {
      id: 'case-dup',
      timestamp: 1,
      query: '帮我写一份 PRD',
      result: base,
      feedback: 'correct' as const,
      correctedRoute: { primaryLens: 'product_manager', intent: 'write_doc' },
    },
  ];
  const candidates = generateRuleCandidates(records, ROUTING_TABLE);
  assert.equal(candidates.length, 0);
});

test('rule-candidate: PCB 安全审查生成干净 match，不带 ambiguity/搜索', () => {
  const base = routeV2('帮我检查一下这个PCB的安全性');
  const records = [
    {
      id: 'case-pcb',
      timestamp: 1,
      query: '帮我检查一下这个PCB的安全性',
      result: base,
      feedback: 'reject' as const,
      correctedRoute: { primaryLens: 'owner', intent: 'risk_review' },
    },
  ];
  const candidates = generateRuleCandidates(records, []);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].match, {
    actionType: 'analyze',
    targetDomain: 'security',
  });
  assert.equal(candidates[0].searchNeed, false);
});

test('rule-candidate: 会议安排候选带 schedule + hasTimeExpression', () => {
  const base = routeV2('帮我安排明天上午十点的会议');
  const records = [
    {
      id: 'case-schedule',
      timestamp: 1,
      query: '帮我安排明天上午十点的会议',
      result: base,
      feedback: 'reject' as const,
      correctedRoute: { primaryLens: 'secretary', intent: 'create_calendar' },
    },
  ];
  const candidates = generateRuleCandidates(records, []);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].match.actionType, 'schedule');
  assert.equal(candidates[0].match.targetDomain, 'schedule');
  assert.equal(candidates[0].match.hasTimeExpression, true);
});

test('rule-candidate: 报价对比候选带 compare + vendor_db', () => {
  const base = routeV2('帮我做一次供应商报价对比');
  const records = [
    {
      id: 'case-compare',
      timestamp: 1,
      query: '帮我做一次供应商报价对比',
      result: base,
      feedback: 'reject' as const,
      correctedRoute: { primaryLens: 'owner', intent: 'compare_vendor_quotes' },
    },
  ];
  const candidates = generateRuleCandidates(records, []);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].match.actionType, 'compare');
  assert.equal(candidates[0].match.targetDomain, 'finance');
  assert.equal(candidates[0].match.searchSourceHint, 'vendor_db');
});
