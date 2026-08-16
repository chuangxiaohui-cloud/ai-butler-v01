import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runCommand } from './terminal.js';

test('terminal: 安全命令返回 stdout 与退出码', async () => {
  const result = await runCommand('node -e "console.log(\'ok\')"', { timeoutMs: 5000 });
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('ok'));
});
