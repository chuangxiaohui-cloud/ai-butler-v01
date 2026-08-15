import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  datasheetPrefixMatch,
  normalizePart,
  verifyDatasheetText,
} from './datasheet-verify.js';

const ST_DATASHEET_SAMPLE = `
STM32F103x8 STM32F103xB
Medium-density performance line Arm-based 32-bit MCU
72 MHz maximum frequency
Datasheet - production data
`;

test('datasheet-verify: 型号归一化只保留字母数字', () => {
  assert.equal(normalizePart('STM32F103C8T6'), 'STM32F103C8T6');
  assert.equal(normalizePart('tps5430dda'), 'TPS5430DDA');
});

test('datasheet-verify: 完整型号命中', () => {
  assert.equal(verifyDatasheetText('TPS5430 3A 宽输入范围降压转换器', 'TPS5430'), true);
  assert.ok(datasheetPrefixMatch('TPS5430 3A', 'TPS5430DDA') >= 6);
});

test('datasheet-verify: ST 家族前缀命中完整型号', () => {
  assert.equal(verifyDatasheetText(ST_DATASHEET_SAMPLE, 'STM32F103C8T6'), true);
  assert.ok(datasheetPrefixMatch(ST_DATASHEET_SAMPLE, 'STM32F103C8T6') >= 9);
});

test('datasheet-verify: 错页 datasheet 被拒绝', () => {
  assert.equal(
    verifyDatasheetText('TPS5430 5.5V to 36V 3A DC-DC converter datasheet', 'STM32F103C8T6'),
    false,
  );
});

test('datasheet-verify: 认证证书无型号前缀被拒绝', () => {
  assert.equal(
    verifyDatasheetText('DNV Business Assurance 管理体系认证证书', 'STM32F103C8T6'),
    false,
  );
});

test('datasheet-verify: 未提供型号时不拦截', () => {
  assert.equal(verifyDatasheetText('任意内容', ''), true);
});
