import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { extractValueRanges, resolveFactConsistency } from './rule1.js';

test('rule1: 抽取数值区间', () => {
  const ranges = extractValueRanges('TPS5430 输入电压范围 4.5-60V，输出 3.3V');
  assert.ok(ranges.some((r) => r.unit === 'v' && r.min === 4.5 && r.max === 60));
});

test('rule1: E02 官方源仲裁胜出，非官方 fact_consistency 归零', () => {
  const items = [
    {
      url: 'https://blog.csdn.net/abc/123',
      title: 'TPS5430 输入电压范围',
      content: 'TPS5430 输入电压范围 4.5-60V',
      query: 'TPS5430 输入电压范围',
    },
    {
      url: 'https://www.ti.com/product/TPS5430',
      title: 'TPS5430 datasheet',
      content: 'TPS5430 输入电压 4.5-36V',
      query: 'TPS5430 输入电压范围',
    },
  ];
  const r = resolveFactConsistency(items);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.factConsistency.get('https://blog.csdn.net/abc/123'), 0);
  assert.equal(r.factConsistency.get('https://www.ti.com/product/TPS5430'), 1);
  assert.equal(r.gated, false);
});

test('rule1: 无官方源时多数一致胜出', () => {
  const items = [
    { url: 'u1', title: 'a', content: '电压 4.5-36V', query: 'TPS5430' },
    { url: 'u2', title: 'b', content: '电压 4.5-36V', query: 'TPS5430' },
    { url: 'u3', title: 'c', content: '电压 4.5-60V', query: 'TPS5430' },
  ];
  const r = resolveFactConsistency(items);
  assert.equal(r.factConsistency.get('u1'), 1);
  assert.equal(r.factConsistency.get('u2'), 1);
  assert.equal(r.factConsistency.get('u3'), 0);
});

test('rule1: 文本归一化后同值不判冲突', () => {
  const items = [
    { url: 'u1', title: 'a', content: '最大主频 72MHz', query: 'STM32F103C8T6' },
    { url: 'u2', title: 'b', content: '主频 72 MHz', query: 'STM32F103C8T6' },
  ];
  const r = resolveFactConsistency(items);
  assert.equal(r.conflicts.length, 0);
  assert.equal(r.factConsistency.get('u1'), 1);
  assert.equal(r.factConsistency.get('u2'), 1);
});
