import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeQuery } from './router.js';

test('router: 紧急安全短路', () => {
  const r = routeQuery('高血压发作，需要急救');
  assert.equal(r.mode, 'life');
  assert.equal(r.searchNeed, 'no');
  assert.equal(r.primaryLens, 'secretary');
});

test('router: 芯片知识问题路由到架构师', () => {
  const r = routeQuery('帮我分析 STM32 芯片性能');
  assert.equal(r.primaryLens, 'architect');
  assert.equal(r.mode, 'knowledge');
});

test('router: 完整应用开发路由到执行', () => {
  const r = routeQuery('帮我做一个完整的 App 前端');
  assert.equal(r.mode, 'execution');
  assert.equal(r.action, 'craft');
  assert.equal(r.searchNeed, 'must');
  assert.equal(r.primaryLens, 'project_manager');
});

test('router: 成本决策路由到老板', () => {
  const r = routeQuery('这个方案成本多少，值不值');
  assert.equal(r.primaryLens, 'owner');
});

test('router: 排期任务路由到项目经理', () => {
  const r = routeQuery('把任务拆解并排期');
  assert.equal(r.primaryLens, 'project_manager');
  assert.equal(r.action, 'plan');
});

test('router: 指代不明触发澄清', () => {
  const r = routeQuery('这个芯片怎么样');
  assert.ok(r.clarify);
});

test('router: 纯创作不联网', () => {
  const r = routeQuery('帮我写一首诗');
  assert.equal(r.searchNeed, 'no');
  assert.equal(r.mode, 'knowledge');
});
