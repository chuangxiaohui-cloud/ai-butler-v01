import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeV2, type RouteResultV2 } from './router-v2.js';

function selectedOf(r: RouteResultV2) {
  if (r.decision.type === 'direct' || r.decision.type === 'confirm') return r.decision.selected;
  throw new Error(`非 direct/confirm 决策：${r.decision.type}`);
}

test('router-v2: E340 生成 Xmind → R_XMIND pm_xmind confirm（写类挂起）', () => {
  const r = routeV2(
    '帮我把这些任务做成思维导图：\n1. 系统设计\n1.1 需求分析\n1.2 总体方案\n2. 硬件设计',
  );
  assert.equal(r.decision.type, 'confirm', '写类 pm_xmind 应落在中带 confirm 供真阻断挂起');
  const selected = selectedOf(r);
  assert.equal(selected.executor, 'pm_xmind');
  assert.equal(selected.intent, 'xmind');
  assert.equal(selected.matchedRule, 'R_XMIND');
});

test('router-v2: E340 读取 .xmind 大纲 → pm_xmind', () => {
  const r = routeV2('读取 outputs/pm-xmind/20260905.xmind 的大纲');
  const selected = selectedOf(r);
  assert.equal(selected.executor, 'pm_xmind');
  assert.equal(selected.primaryLens, 'project_manager');
});

test('router-v2: E340 知识问句（Xmind 是什么）不落 pm_xmind', () => {
  const r = routeV2('Xmind 是什么，和思维导图有什么关系？');
  const selected = selectedOf(r);
  assert.notEqual(selected.executor, 'pm_xmind');
  assert.equal(selected.intent, 'web_search');
});

test('router-v2: E340 问句“怎么做思维导图”走知识问答而非写类', () => {
  const r = routeV2('思维导图怎么做才清晰？');
  const selected = selectedOf(r);
  assert.notEqual(selected.executor, 'pm_xmind');
});

test('router-v2: E340 软件咨询（Xmind 好用吗）不落写类', () => {
  const r = routeV2('Xmind 软件好用吗，推荐用哪个版本？');
  const selected = selectedOf(r);
  assert.notEqual(selected.executor, 'pm_xmind');
});

test('router-v2: E342 主题型内容思维导图（问句：FreeRTOS 的软件架构思维导图？）→ R_XMIND_CONTENT 走检索', () => {
  const r = routeV2('FreeRTOS 的软件架构思维导图？');
  const selected = selectedOf(r);
  assert.equal(selected.matchedRule, 'R_XMIND_CONTENT');
  assert.equal(selected.intent, 'xmind_content');
  assert.equal(selected.executor, undefined);
  assert.equal(selected.searchNeed, true);
  assert.equal(selected.primaryLens, 'project_manager');
});

test('router-v2: E342 把主题做成思维导图（无自带大纲）也走 R_XMIND_CONTENT', () => {
  const r = routeV2('把 FreeRTOS 软件架构做成思维导图');
  const selected = selectedOf(r);
  assert.equal(selected.matchedRule, 'R_XMIND_CONTENT');
  assert.equal(selected.intent, 'xmind_content');
  assert.equal(selected.executor, undefined);
  assert.equal(selected.searchNeed, true);
});

test('router-v2: E342 自带大纲结构行仍走 R_XMIND 直接生成（不被内容型抢走）', () => {
  const r = routeV2('把这段大纲做成思维导图：\n1. 系统设计\n1.1 需求分析\n2. 硬件设计');
  const selected = selectedOf(r);
  assert.equal(selected.matchedRule, 'R_XMIND');
  assert.equal(selected.intent, 'xmind');
  assert.equal(selected.executor, 'pm_xmind');
  assert.equal(selected.searchNeed, false);
});

test('router-v2: E342 咨询问句不落内容型（Xmind 思维导图软件哪个好用 / FreeRTOS 思维导图怎么做）', () => {
  for (const q of ['Xmind 思维导图软件哪个好用', 'FreeRTOS 思维导图怎么做']) {
    const r = routeV2(q);
    const selected = selectedOf(r);
    assert.notEqual(selected.matchedRule, 'R_XMIND_CONTENT', q);
    assert.notEqual(selected.matchedRule, 'R_XMIND', q);
    assert.equal(selected.intent, 'web_search', q);
  }
});
