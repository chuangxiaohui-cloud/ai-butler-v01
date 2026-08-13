import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { findSkill, getSkills } from './registry.js';

test('registry: 6 项预置 Skill 全量加载', () => {
  const skills = getSkills();
  assert.equal(skills.length, 6);
  const names = skills.map((s) => s.name);
  assert.deepEqual(
    names.sort(),
    [
      'chip-analysis',
      'circuit-topology',
      'datasheet-speed',
      'github-reader',
      'industry-kits',
      'jargon-map',
    ].sort(),
  );
});

test('registry: 核心 2 项经 wrapLegacySkill 可执行', async () => {
  const chip = getSkills().find((s) => s.name === 'chip-analysis');
  const jargon = getSkills().find((s) => s.name === 'jargon-map');
  assert.ok(chip);
  assert.ok(jargon);
  const deps = { callVLM: async () => '' };
  const chipOut = await chip.execute(
    { query: 'STM32F103C8T6 最大主频是多少', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  const chipResult = chipOut.result as {
    partNumber: string;
    supported: boolean;
  };
  assert.equal(chipResult.partNumber, 'STM32F103C8T6');
  assert.equal(chipResult.supported, true);
  const jargonOut = await jargon.execute(
    { query: 'Protel 怎么画四层板', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  const jargonResult = jargonOut.result as {
    matched: Array<{ term: string; normalized: string }>;
    normalizedQuery: string;
  };
  assert.equal(jargonResult.matched[0].normalized, 'Altium Designer');
  assert.equal(jargonResult.normalizedQuery, 'Altium Designer 怎么画四层板');
});

test('registry: findSkill 按触发器匹配', () => {
  assert.ok(findSkill('帮我分析 STM32 芯片').some((s) => s.name === 'chip-analysis'));
  assert.ok(findSkill('Protel 是什么').some((s) => s.name === 'jargon-map'));
  assert.equal(findSkill('今天天气怎么样').length, 0);
});
