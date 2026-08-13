import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PARAMS } from '../../src/config/params.js';
import type { SkillDeps } from '../../src/skills/deps.js';
import {
  toDisplayText,
  wrapLegacySkill,
  type SkillInput,
} from '../../src/skills/registry.js';

const deps: SkillDeps = { callVLM: async () => '' };
const base: SkillInput = { query: 'q', attachmentSignals: [], rawFiles: [], memory: null };

test('wrapLegacySkill：对象结果原样透传 + P-89 置信度', async () => {
  const skill = wrapLegacySkill({
    name: 'a',
    version: '1',
    triggers: [],
    handler: async () => ({ a: 1 }),
  });
  const out = await skill.execute(base, deps);
  assert.deepEqual(out.result, { a: 1 });
  assert.equal(out.confidence, PARAMS.legacySkillConfidence);
});

test('wrapLegacySkill：null 透传，不字符串化', async () => {
  const skill = wrapLegacySkill({
    name: 'b',
    version: '1',
    triggers: [],
    handler: async () => null,
  });
  const out = await skill.execute(base, deps);
  assert.equal(out.result, null);
  assert.equal(toDisplayText(out.result), '');
});

test('toDisplayText：string / {text} / {answer} / 其他对象', () => {
  assert.equal(toDisplayText('x'), 'x');
  assert.equal(toDisplayText({ text: 't' }), 't');
  assert.equal(toDisplayText({ answer: 'a' }), 'a');
  assert.equal(toDisplayText({ a: 1 }), '{"a":1}');
});
