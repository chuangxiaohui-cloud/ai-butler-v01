import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeV2, type RouteResultV2 } from './router-v2.js';
import { extractIntentFeatureRuleBased } from './intent-feature.js';
import { detectDiagramType } from '../skills/archify/index.js';

function selectedOf(r: RouteResultV2) {
  if (r.decision.type === 'direct' || r.decision.type === 'confirm') return r.decision.selected;
  throw new Error(`非 direct/confirm 决策：${r.decision.type}`);
}

test('router-v2: E352 画流程图 → R_ARCHIFY confirm 写类 archify', () => {
  const r = routeV2('把 CI/CD 发布流程画成一张流程图，标注失败重试分支');
  const selected = selectedOf(r);
  assert.equal(selected.matchedRule, 'R_ARCHIFY');
  assert.equal(selected.executor, 'archify');
  assert.equal(selected.intent, 'archify_diagram');
  assert.equal(selected.searchNeed, false);
  assert.equal(selected.primaryLens, 'architect');
  assert.equal(r.decision.type, 'confirm');
});

test('router-v2: E352 系统架构/框架/模块图被 E364 layered-arch 接管，不再落 archify', () => {
  for (const query of [
    '帮我画一下订单系统的系统架构图，标出组件和调用关系',
    '画一个嵌入式 FreeRTOS 系统框架图',
    '画一个物联网网关的模块图',
  ]) {
    const feat = extractIntentFeatureRuleBased(query);
    assert.equal(feat.actionType, 'layered_arch_diagram', query);
  }
});

test('router-v2: E352 图型关键词映射（流程/时序/数据流/生命周期）', () => {
  const cases: Array<[string, string]> = [
    ['把 CI/CD 发布流程画成一张流程图', 'workflow'],
    ['画一个 Redis 缓存穿透的时序图', 'sequence'],
    ['生成一张埋点数据的数据流图', 'dataflow'],
    ['画一下订单的状态机图，含取消和超时', 'lifecycle'],
  ];
  for (const [query, type] of cases) {
    const feat = extractIntentFeatureRuleBased(query);
    assert.equal(feat.actionType, 'archify_diagram', query);
    assert.equal(detectDiagramType(query), type, query);
  }
});

test('router-v2: E352 图型咨询问句（怎么画/是什么）不落 archify', () => {
  for (const query of ['怎么画架构图？', '什么是时序图？', '有没有推荐的流程图工具？', 'UML 序列图怎么画']) {
    const r = routeV2(query);
    const selected = selectedOf(r);
    assert.notEqual(selected.executor, 'archify', query);
  }
});

test('router-v2: E352 思维导图边界词仍归 xmind，不抢 archify', () => {
  const feat = extractIntentFeatureRuleBased('把 FreeRTOS 的软件架构做成思维导图');
  assert.notEqual(feat.actionType, 'archify_diagram');
});

test('router-v2: E352 解读已有架构图（带图附件）不当作新画图', () => {
  const feat = extractIntentFeatureRuleBased('解读这张系统架构图，讲讲分层', [
    { type: 'image', mimeType: 'image/png', sizeBytes: 1024, fileName: 'arch.png' },
  ]);
  assert.notEqual(feat.actionType, 'archify_diagram');
});
