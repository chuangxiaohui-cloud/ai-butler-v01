import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { isPathAllowed, logSandboxAudit } from './sandbox.js';

test('sandbox: 白名单根目录内放行', () => {
  const root = 'M:\\workspace';
  assert.equal(isPathAllowed('projects/app/main.c', root).allowed, true);
  assert.equal(isPathAllowed('sandbox/tmp.out', root).allowed, true);
  assert.equal(isPathAllowed('outputs/report.pdf', root).allowed, true);
});

test('sandbox: 越界路径拒绝', () => {
  const root = 'M:\\workspace';
  assert.equal(isPathAllowed('C:\\Windows\\system32\\test.txt', root).allowed, false);
  assert.equal(isPathAllowed('~/.ssh/id_rsa', root).allowed, false);
  assert.equal(isPathAllowed('../outside.txt', root).allowed, false);
});

test('sandbox: 越界写入审计日志', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-test-'));
  const logPath = join(dir, 'audit.jsonl');
  try {
    const check = isPathAllowed('C:\\Windows\\system32\\test.txt', dir);
    assert.equal(check.allowed, false);
    logSandboxAudit(
      {
        requestedPath: 'C:\\Windows\\system32\\test.txt',
        allowed: false,
        reason: check.reason,
        ts: '2026-08-12T00:00:00Z',
      },
      logPath,
    );
    const line = readFileSync(logPath, 'utf-8').trim();
    const entry = JSON.parse(line) as { allowed: boolean; reason?: string };
    assert.equal(entry.allowed, false);
    assert.ok(entry.reason?.includes('越界'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
