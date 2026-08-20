import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  extractCoordinateBomRows,
  isValueWord,
  type PdfSymbolPage,
} from './coordinates.js';

function word(text: string, x0: number, y0: number): PdfSymbolPage['words'][number] {
  return { text, x0, y0, x1: x0 + 6, y1: y0 + 4, size: 100 };
}

const PAGES: PdfSymbolPage[] = [
  {
    page: 1,
    width: 200,
    height: 200,
    wordCount: 15,
    textSymbols: [],
    drawingSymbols: [],
    words: [
      word('R1', 10, 10),
      word('10k', 18, 10),
      word('0603', 30, 10),
      word('C1', 10, 50),
      word('0.1uF/16V', 18, 50),
      word('0402', 30, 50),
      word('P9', 70, 80),
      word('P10', 76, 80),
      word('P11', 70, 86),
      word('P12', 76, 86),
      word('P13', 70, 92),
      word('P14', 76, 92),
      word('P15', 70, 98),
      word('P16', 76, 98),
      word('1.8V', 60, 80),
    ],
  },
];

test('coordinates: 最近邻绑定位号与值/封装', () => {
  const rows = extractCoordinateBomRows(PAGES);
  const r = rows.find((row) => row.designators.includes('R1'));
  const c = rows.find((row) => row.designators.includes('C1'));
  assert.equal(r?.value, '10k');
  assert.equal(r?.package, '0603');
  assert.equal(c?.value, '0.1uF/16V');
  assert.equal(c?.package, '0402');
});

test('coordinates: 密集引脚区且无值证据时排除', () => {
  const rows = extractCoordinateBomRows(PAGES);
  assert.ok(!rows.some((row) => row.designators.includes('P9')));
});

test('coordinates: 电压网络不算元件值', () => {
  assert.equal(isValueWord('1.8V'), false);
  assert.equal(isValueWord('0.1uF/16V'), true);
});
