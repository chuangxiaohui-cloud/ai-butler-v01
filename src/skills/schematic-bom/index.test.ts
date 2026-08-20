import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildBomCsv, extractBomRows } from './index.js';

const SCHEMATIC_TEXT = `
R1 10k 0603
R2 10k 0603
C1 100nF 0603
U1 STM32F103 LQFP48
C2 100nF 0603
`;

test('schematic-bom: 解析位号并按值/封装聚合', () => {
  const rows = extractBomRows(SCHEMATIC_TEXT);
  assert.equal(rows.length, 3);
  const r = rows.find((x) => x.type === '电阻');
  assert.equal(r?.designators.join(','), 'R1,R2');
  assert.equal(r?.quantity, 2);
  const c = rows.find((x) => x.type === '电容');
  assert.equal(c?.quantity, 2);
  const u = rows.find((x) => x.type === 'IC');
  assert.equal(u?.value, 'STM32F103');
  assert.equal(u?.package, 'LQFP48');
});

test('schematic-bom: CSV 带表头与聚合数量', () => {
  const csv = buildBomCsv(extractBomRows(SCHEMATIC_TEXT));
  assert.ok(csv.includes('序号,类型,位号,值/型号,封装,数量'));
  assert.ok(csv.includes('R1 R2'));
  assert.ok(csv.includes('2'));
});

test('schematic-bom: 无位号时返回空 BOM', () => {
  assert.deepEqual(extractBomRows('这是一个普通说明文档，没有元件。'), []);
});

test('schematic-bom: 忽略电源/GND 等噪声词', () => {
  const rows = extractBomRows('VCC GND R3 4.7k 0805');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].designators[0], 'R3');
});
