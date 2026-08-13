import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildRegistryInsertion,
  renderSkillSource,
  validateSkillManifest,
} from './install.js';

test('skill-install: manifest 校验通过并归一化', () => {
  const m = validateSkillManifest({
    name: 'foo-skill',
    version: '0.1.0',
    triggers: ['foo', ''],
    description: '示例 Skill',
  });
  assert.equal(m.name, 'foo-skill');
  assert.equal(m.version, '0.1.0');
  assert.deepEqual(m.triggers, ['foo']);
});

test('skill-install: 非法 manifest 拒绝', () => {
  assert.throws(() => validateSkillManifest({ name: 'Bad Name', version: '1', triggers: ['x'] }));
  assert.throws(() => validateSkillManifest({ name: 'ok', version: '', triggers: ['x'] }));
  assert.throws(() => validateSkillManifest({ name: 'ok', version: '1', triggers: [] }));
});

test('skill-install: 生成 Skill 源码', () => {
  const source = renderSkillSource({
    name: 'foo-skill',
    version: '0.2.0',
    triggers: ['foo', '示例'],
  });
  assert.ok(source.includes("name: 'foo-skill'"));
  assert.ok(source.includes("version: '0.2.0'"));
  assert.ok(source.includes("'foo'"));
  assert.ok(source.includes("'示例'"));
});

test('skill-install: registry 自动注册且幂等', () => {
  const registry = `import { skill as industryKits } from './industry-kits/index.js';\n\nconst SKILLS: LegacySkillDef[] = [\n  industryKits,\n];\n`;
  const manifest = { name: 'foo-skill', version: '0.1.0', triggers: ['foo'] };
  const first = buildRegistryInsertion(manifest, registry);
  assert.ok(first.updated.includes("from './foo-skill/index.js'"));
  assert.ok(first.updated.includes('  foo_skill,'));
  const second = buildRegistryInsertion(manifest, first.updated);
  assert.equal(second.updated, first.updated);
});
