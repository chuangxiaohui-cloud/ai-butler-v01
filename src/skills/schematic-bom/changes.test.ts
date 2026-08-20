import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { applyBomChangeNotes, parseBomChangeNotes } from './changes.js';
import type { BomRow } from './index.js';

const ROWS: BomRow[] = [
  { type: '电阻', value: '1K', package: '0603', designators: ['R44'], quantity: 1 },
  { type: '电容', value: '0.1uF', package: '0402', designators: ['C10'], quantity: 1 },
  { type: '电阻', value: '0R', package: '0402', designators: ['R188', 'R190'], quantity: 2 },
];

test('changes: 解析 Delete / BOM change / 箭头变更', () => {
  const notes = parseBomChangeNotes(
    'Delete R44\nC10 BOM change to 100pF\nR188,R190 --> 0R\nAdd C200',
  );
  assert.deepEqual(
    notes.find((n) => n.action === 'delete')?.designators,
    ['R44'],
  );
  assert.deepEqual(
    notes.find((n) => n.designators.includes('C10'))?.value,
    '100pF',
  );
  assert.deepEqual(
    notes.find((n) => n.designators.includes('R188'))?.designators,
    ['R188', 'R190'],
  );
  assert.ok(notes.some((n) => n.action === 'add' && n.designators.includes('C200')));
});

test('changes: 合并删除/改值/新增', () => {
  const rows = applyBomChangeNotes(ROWS, parseBomChangeNotes(
    'Delete R44\nC10 BOM change to 100pF\nR188,R190 --> 0R\nAdd C200',
  ));
  assert.ok(!rows.some((r) => r.designators.includes('R44')));
  assert.equal(rows.find((r) => r.designators.includes('C10'))?.value, '100pF');
  assert.ok(rows.some((r) => r.designators.includes('C200')));
});
