import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { routeV2, type RouteResultV2 } from './router-v2.js';

function selectedOf(r: RouteResultV2) {
  if (r.decision.type === 'direct' || r.decision.type === 'confirm') return r.decision.selected;
  throw new Error(`非 direct/confirm 决策：${r.decision.type}`);
}

test('router-v2: E353 改文件影响分析 → R_CODEGRAPH 只读直连 codegraph', () => {
  const r = routeV2('如果我改了 src/bsp_uart.c 会波及哪些模块？');
  const selected = selectedOf(r);
  assert.equal(selected.matchedRule, 'R_CODEGRAPH');
  assert.equal(selected.executor, 'codegraph');
  assert.equal(selected.intent, 'codegraph_impact');
  assert.equal(selected.searchNeed, false);
  assert.equal(selected.primaryLens, 'architect');
});

test('router-v2: E353 谁调用符号 → R_CODEGRAPH', () => {
  const r = routeV2('谁调用了 boot_main？想看看影响范围');
  const selected = selectedOf(r);
  assert.equal(selected.executor, 'codegraph');
});

test('router-v2: E353 解读项目组成 → R_CODEGRAPH', () => {
  const r = routeV2('解读一下 M:\\myfirmware\\app 项目的模块组成');
  const selected = selectedOf(r);
  assert.equal(selected.matchedRule, 'R_CODEGRAPH');
  assert.equal(selected.executor, 'codegraph');
  assert.equal(selected.primaryLens, 'architect');
});

test('router-v2: E353 概念问句（什么是代码影响分析）不落本地分析', () => {
  const r = routeV2('什么是代码影响分析？有哪些工具可以做？');
  const selected = selectedOf(r);
  assert.notEqual(selected.matchedRule, 'R_CODEGRAPH');
  assert.equal(selected.intent, 'web_search');
});

test('router-v2: E353 生活类问句（改天出行会影响什么）不落 codegraph', () => {
  const r = routeV2('改天去广州玩会影响什么？');
  const selected = selectedOf(r);
  assert.notEqual(selected.executor, 'codegraph');
});
