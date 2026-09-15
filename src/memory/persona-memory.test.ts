import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCorrectionPreferenceFact,
  classifyPersonaMemory,
  memoryConflictKey,
} from './persona-memory.js';

test('persona memory: 术语映射与用语偏好归 Chat Memory L1', () => {
  assert.deepEqual(classifyPersonaMemory('Protel 指的是 Altium Designer'), {
    kind: 'terminology',
    layer: 'L1',
  });
  assert.deepEqual(classifyPersonaMemory('回复时请叫我老板'), {
    kind: 'language_preference',
    layer: 'L1',
  });
});

test('persona memory: 技术偏好归 L2，普通事实保守归 L1', () => {
  assert.deepEqual(classifyPersonaMemory('我偏好使用 STM32 平台和 Keil 工具链'), {
    kind: 'technical_preference',
    layer: 'L2',
  });
  assert.deepEqual(classifyPersonaMemory('用户喜欢周星驰'), {
    kind: 'general',
    layer: 'L1',
  });
});

test('persona memory: 只为可确定槽位生成冲突键', () => {
  assert.equal(memoryConflictKey('Protel 指的是 Altium Designer'), 'terminology:protel');
  assert.equal(memoryConflictKey('回复时请叫我老板'), 'language_preference:address');
  assert.equal(memoryConflictKey('我偏好 KiCad EDA'), 'technical_preference:eda');
  assert.equal(memoryConflictKey('用户喜欢周星驰'), '');
});

test('persona memory: 已解决生活/情绪主题作为 L2 人格素材', () => {
  assert.deepEqual(
    classifyPersonaMemory('用户已解决的情绪话题：最近工作压力很大，晚上总是失眠'),
    { kind: 'general', layer: 'L2' },
  );
  assert.deepEqual(
    classifyPersonaMemory('用户已解决的日常话题：最近通勤时间太长'),
    { kind: 'general', layer: 'L2' },
  );
});

test('persona memory: 用户修订回复按技术内容映射 L1-L2', () => {
  const technical = buildCorrectionPreferenceFact('应优先核对 STM32 的工作温度范围。');
  const general = buildCorrectionPreferenceFact('请先给结论，再补充解释。');
  assert.equal(classifyPersonaMemory(technical).layer, 'L2');
  assert.equal(classifyPersonaMemory(general).layer, 'L1');
  assert.equal(memoryConflictKey(technical), '');
});
