import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { checkArchitectureSemantics } from './semantics.js';

function arch(components: unknown[], connections: unknown[], diagramType = 'architecture'): unknown {
  return {
    schema_version: 1,
    diagram_type: diagramType,
    meta: { title: 't', quality_profile: 'showcase' },
    layout: { mode: 'grid', cols: 3 },
    components,
    connections,
  };
}

const SERVICES = [
  { id: 'order-svc', type: 'backend', label: '订单服务', row: 0, col: 0 },
  { id: 'stock-svc', type: 'backend', label: '库存服务', row: 0, col: 1 },
  { id: 'pay-svc', type: 'backend', label: '支付服务', row: 1, col: 0 },
];
const DBS = [
  { id: 'order-db', type: 'database', label: '订单数据库', row: 2, col: 0 },
  { id: 'stock-db', type: 'database', label: '库存数据库', row: 2, col: 1 },
];

test('semantics: E360 干净微服务闭环通过（服务都连自己的库、无跨写、无死胡同）', () => {
  const obj = arch(
    [...SERVICES, ...DBS],
    [
      { id: 'c1', from: 'client', to: 'order-svc', label: '下单' },
      { id: 'c2', from: 'order-svc', to: 'order-db', label: '读写' },
      { id: 'c3', from: 'order-svc', to: 'stock-svc', label: '扣库存' },
      { id: 'c4', from: 'stock-svc', to: 'stock-db', label: '读写' },
      { id: 'c5', from: 'order-svc', to: 'pay-svc', label: '发起支付' },
      { id: 'c6', from: 'pay-svc', to: 'order-svc', label: '支付结果', variant: 'dashed' },
    ],
  );
  const result = checkArchitectureSemantics(obj);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('semantics: E360 孤儿库 / 主数据无家 / 回调落库 / 服务死胡同 全部命中', () => {
  // 复刻 owner 样本 architecture-0906-192218 的拓扑错误
  const obj = arch(
    [...SERVICES, ...DBS],
    [
      { id: 'c1', from: 'client', to: 'order-svc', label: '下单请求' },
      { id: 'c2', from: 'order-svc', to: 'stock-svc', label: '扣库存' },
      { id: 'c3', from: 'order-svc', to: 'pay-svc', label: '发起支付' },
      // 错误：支付服务虚线直连订单库，且订单服务没连自己的库
      { id: 'c4', from: 'pay-svc', to: 'order-db', label: '支付结果', variant: 'dashed' },
    ],
  );
  const result = checkArchitectureSemantics(obj);
  assert.equal(result.ok, false);
  const codes = new Set(result.issues.map((i) => i.code));
  assert.ok(codes.has('owner-database-unconnected'), '订单库只被支付服务连、订单服务漏连');
  assert.ok(codes.has('async-edge-to-database'), '虚线回调指向数据库');
  assert.ok(codes.has('service-leaf'), '库存服务死胡同');
  assert.ok(codes.has('orphan-database'), '库存库无入边');
});

test('semantics: E360 跨写别人的库（归属已连自己库仍被他人直连）命中', () => {
  const obj = arch(
    [...SERVICES, ...DBS],
    [
      { id: 'c1', from: 'order-svc', to: 'order-db', label: '读写' },
      { id: 'c2', from: 'pay-svc', to: 'order-db', label: '对账查询' },
    ],
  );
  const result = checkArchitectureSemantics(obj);
  const codes = new Set(result.issues.map((i) => i.code));
  assert.ok(codes.has('cross-write-database'));
});

test('semantics: E360 非 architecture / 无库图不启用归属检查', () => {
  assert.equal(checkArchitectureSemantics({ diagram_type: 'workflow', nodes: [] }).ok, true);
  const noDb = arch(
    [{ id: 'a', type: 'backend', label: 'A', row: 0, col: 0 }],
    [{ from: 'a', to: 'b', label: 'x' }],
  );
  assert.equal(checkArchitectureSemantics(noDb).ok, true);
});
