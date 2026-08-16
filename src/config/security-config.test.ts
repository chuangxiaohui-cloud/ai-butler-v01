import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readSecurityConfig, writeSecurityConfig } from './security-config.js';

test('security-config: 默认 Shell 关闭，读写持久化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'security-config-'));
  const file = join(dir, 'security-config.json');
  try {
    const empty = readSecurityConfig(file);
    assert.equal(empty.shellEnabled, false);
    assert.equal(empty.fileAccess, 'project-only');
    assert.equal(empty.illegalEnabled, true);
    writeSecurityConfig({ ...empty, shellEnabled: true }, file);
    assert.equal(readSecurityConfig(file).shellEnabled, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
