import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readDisabledSkills, writeDisabledSkills } from './skills-config.js';

test('skills-config: 读写禁用列表', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skills-config-'));
  const file = join(dir, 'skills-config.json');
  try {
    assert.deepEqual([...readDisabledSkills(file)], []);
    writeDisabledSkills(['calendar-skill'], file);
    assert.deepEqual([...readDisabledSkills(file)], ['calendar-skill']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
