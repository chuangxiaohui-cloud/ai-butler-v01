import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeV2, type RouteResultV2 } from './router-v2.js';
import { extractIntentFeatureRuleBased } from './intent-feature.js';

function selectedOf(r: RouteResultV2) {
  if (r.decision.type === 'direct' || r.decision.type === 'confirm') return r.decision.selected;
  throw new Error(`非 direct/confirm 决策：${r.decision.type}`);
}

test('router-v2: E364 画系统架构图 → R_LAYERED_ARCH confirm 写类 layered_arch', () => {
  const r = routeV2('帮我画一下订单系统的系统架构图，标出组件和调用关系');
  const selected = selectedOf(r);
  assert.equal(selected.matchedRule, 'R_LAYERED_ARCH');
  assert.equal(selected.executor, 'layered_arch');
  assert.equal(selected.intent, 'layered_arch_diagram');
  assert.equal(selected.searchNeed, false);
  assert.equal(selected.primaryLens, 'architect');
  assert.equal(r.decision.type, 'confirm');
});

test('router-v2: E364 框架图/模块图/分层图 归 layered_arch', () => {
  for (const query of ['画一个嵌入式 FreeRTOS 系统框架图', '画一个物联网网关的模块图', '帮我画一张订单系统的分层图']) {
    const feat = extractIntentFeatureRuleBased(query);
    assert.equal(feat.actionType, 'layered_arch_diagram', query);
    const r = routeV2(query);
    assert.equal(selectedOf(r).executor, 'layered_arch', query);
  }
});

test('router-v2: E364 流程/时序/数据流/生命周期图不归 layered_arch（留给 archify）', () => {
  for (const query of [
    '把 CI/CD 发布流程画成一张流程图',
    '画一个 Redis 缓存穿透的时序图',
    '生成一张埋点数据的数据流图',
    '画一下订单的状态机图，含取消和超时',
  ]) {
    const feat = extractIntentFeatureRuleBased(query);
    assert.equal(feat.actionType, 'archify_diagram', query);
  }
});

test('router-v2: E364 架构图咨询问句（怎么画/是什么）不落 layered_arch', () => {
  for (const query of ['怎么画架构图？', '什么是系统架构图？', '怎么画分层图']) {
    const r = routeV2(query);
    const selected = selectedOf(r);
    assert.notEqual(selected.executor, 'layered_arch', query);
  }
});

test('router-v2: E364 解读已有架构图（带图附件）不当作新画图', () => {
  const feat = extractIntentFeatureRuleBased('解读这张系统架构图，讲讲分层', [
    { type: 'image', mimeType: 'image/png', sizeBytes: 1024, fileName: 'arch.png' },
  ]);
  assert.notEqual(feat.actionType, 'layered_arch_diagram');
});
