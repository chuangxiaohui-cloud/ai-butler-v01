import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { validateLayeredDiagram } from './validate.js';

const OK = {
  meta: { title: '示例分层图' },
  layers: [
    { id: 'app', name: '应用层', order: 1, nodes: [{ id: 't1', name: '任务一', detail: '采集' }] },
    {
      id: 'kernel',
      name: '内核层',
      order: 2,
      highlight: true,
      nodes: [
        { id: 'sched', name: '调度器', role: 'core' },
        { id: 'q', name: '队列' },
      ],
    },
    { id: 'hw', name: '硬件层', order: 3, nodes: [{ id: 'mcu', name: 'MCU' }] },
  ],
  connections: [
    { from: 'app', to: 'kernel', label: 'OS API' },
    { from: 'kernel', to: 'hw' },
  ],
  rules: ['ISR 只调 FromISR'],
};

test('layered-arch: E364 合法分层图通过', () => {
  const result = validateLayeredDiagram(OK);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.issues, []);
});

test('layered-arch: E364 常见结构错误逐条命中', () => {
  const cases: Array<[unknown, string]> = [
    [null, '顶层必须是 JSON 对象'],
    [{ meta: {}, layers: [] }, 'meta.title 必填'],
    [{ meta: { title: 'x' } }, 'layers 必须是至少 1 层的数组'],
    [
      { meta: { title: 'x' }, layers: [{ id: 'a', name: 'A', nodes: [{ id: 'n', name: '节点' }] }] },
      'OK', // 单层无 connections 合法
    ],
    [
      {
        meta: { title: 'x' },
        layers: [
          { id: 'a', name: 'A', nodes: [{ id: 'n', name: 'N' }] },
          { id: 'b', name: 'B', nodes: [{ id: 'm', name: 'M' }] },
        ],
        connections: [{ from: 'b', to: 'a', label: '反向' }],
      },
      '必须连接相邻两层',
    ],
    [
      {
        meta: { title: 'x' },
        layers: [
          { id: 'a', name: 'A', nodes: [{ id: 'n', name: 'N' }] },
          { id: 'b', name: 'B', nodes: [{ id: 'n', name: '重复' }] },
        ],
      },
      '节点 id 重复',
    ],
    [
      {
        meta: { title: 'x' },
        layers: [
          { id: 'a', name: 'A', nodes: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, name: `N${i}` })) },
        ],
      },
      '超过上限',
    ],
    [
      {
        meta: { title: 'x' },
        layers: [{ id: 'a', name: 'A', nodes: [{ id: 'n', name: 'N', role: 'corex' }] }],
      },
      'role 只允许 "core"',
    ],
  ];
  for (const [data, expect] of cases) {
    const result = validateLayeredDiagram(data);
    if (expect === 'OK') {
      assert.equal(result.ok, true, JSON.stringify(result.issues));
    } else {
      assert.equal(result.ok, false, '应判非法');
      assert.ok(result.issues.some((issue) => issue.includes(expect)), JSON.stringify(result.issues));
    }
  }
});

test('layered-arch: E364 非相邻层引用与非法 rules 命中', () => {
  const data = {
    meta: { title: 'x' },
    layers: [
      { id: 'a', name: 'A', nodes: [{ id: 'n', name: 'N' }] },
      { id: 'b', name: 'B', nodes: [{ id: 'm', name: 'M' }] },
      { id: 'c', name: 'C', nodes: [{ id: 'p', name: 'P' }] },
    ],
    connections: [{ from: 'a', to: 'c', label: '跨层' }],
    rules: ['ok', 7],
  };
  const result = validateLayeredDiagram(data);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes('必须连接相邻两层')));
  assert.ok(result.issues.some((i) => i.includes('rules 必须是字符串数组')));
});
