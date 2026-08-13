import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  validateIntentFeature,
  extractIntentFeatureRuleBased,
} from './intent-feature.js';
import { routeFromFeatures, routeV2 } from './router-v2.js';

test('router-v2: 完整 App 前端 → PM plan 直接路由', () => {
  const r = routeV2('帮我做一个完整的 App 前端');
  assert.equal(r.features.actionType, 'create');
  assert.equal(r.features.targetDomain, 'code');
  assert.equal(r.features.scope, 'project_level');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.primaryLens, 'project_manager');
    assert.equal(r.decision.selected.intent, 'plan');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.85) < 1e-6);
  }
});

test('router-v2: PRD → product_manager write_doc 且关闭搜索', () => {
  const r = routeV2('帮我写一份 PRD');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.primaryLens, 'product_manager');
    assert.equal(r.decision.selected.intent, 'write_doc');
    assert.equal(r.decision.selected.searchNeed, false);
    assert.ok(Math.abs(r.decision.selected.confidence - 0.75) < 1e-6);
  }
});

test('router-v2: 登录接口 → architect execute', () => {
  const r = routeV2('帮我写代码实现一个登录接口');
  assert.equal(r.features.scope, 'atomic');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'execute');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.8) < 1e-6);
  }
});

test('router-v2: 查日程 → secretary local_query + calendar skill', () => {
  const r = routeV2('查一下我今天的日程');
  assert.equal(r.features.targetDomain, 'schedule');
  assert.equal(r.features.searchSourceHint, 'local_skill');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'local_query');
    assert.equal(r.decision.selected.skill, 'calendar_skill');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.9) < 1e-6);
  }
});

test('router-v2: 发消息 → secretary send_message + im skill', () => {
  const r = routeV2('发消息给老张');
  assert.equal(r.features.actionType, 'send');
  assert.equal(r.decision.type, 'direct');
  if (r.decision.type === 'direct') {
    assert.equal(r.decision.selected.intent, 'send_message');
    assert.equal(r.decision.selected.skill, 'im_dispatch');
    assert.ok(Math.abs(r.decision.selected.confidence - 0.8) < 1e-6);
  }
});

test('router-v2: 方案成本 → 选项式消歧而非硬猜', () => {
  const r = routeV2('这个方案成本多少，值不值');
  assert.ok(r.features.ambiguityFlags.includes('missing_referent'));
  assert.ok(Math.abs(r.confidence - 0.4) < 1e-6);
  assert.equal(r.decision.type, 'option_clarify');
  if (r.decision.type === 'option_clarify') {
    assert.ok(r.decision.options.length >= 2);
  }
});

test('router-v2: IntentFeature 校验拒绝非法枚举', () => {
  assert.throws(() =>
    validateIntentFeature({ actionType: 'bad', targetDomain: 'code' }),
  );
});

test('router-v2: 规则特征提取可离线运行', () => {
  const f = extractIntentFeatureRuleBased('发消息给老张');
  assert.equal(f.actionType, 'send');
  assert.equal(f.targetDomain, 'message');
  assert.equal(f.searchSourceHint, 'local_skill');
});

test('router-v2: 工作记忆参与选项式消歧', () => {
  const features = extractIntentFeatureRuleBased('这个方案成本多少，值不值');
  const r = routeFromFeatures('这个方案成本多少，值不值', features, 'rule', [
    '之前讨论过 STM32 选型方案',
    '之前讨论过 App 前端方案',
  ]);
  assert.equal(r.decision.type, 'option_clarify');
  if (r.decision.type === 'option_clarify') {
    assert.ok(r.decision.options[0].label.includes('STM32'));
  }
});
