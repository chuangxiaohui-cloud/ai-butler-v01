/**
 * E428：固件摘要只读 CLI 单测。
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { runFirmwareDigestCli } from './firmware-digest-cli.js';

test('E428: 缺少 path / 越界拒绝', () => {
  const missing = runFirmwareDigestCli([]);
  assert.equal(missing.exit, 1);
  assert.match(String((missing.output as { error: string }).error), /缺少 --path/);

  const dir = mkdtempSync(join(tmpdir(), 'e428-deny-'));
  try {
    mkdirSync(join(dir, 'projects'), { recursive: true });
    writeFileSync(join(dir, 'secret.bin'), Buffer.from([9]));
    const denied = runFirmwareDigestCli(['--path', 'secret.bin'], { cwd: dir, now: 1 });
    assert.equal(denied.exit, 1);
    assert.match(String((denied.output as { error: string }).error), /越界|白名单/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E428: 沙箱内固件产出 SHA-256', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e428-ok-'));
  try {
    mkdirSync(join(dir, 'projects'), { recursive: true });
    const bytes = Buffer.from([1, 2, 3, 4, 5]);
    writeFileSync(join(dir, 'projects', 'app.bin'), bytes);
    const expected = createHash('sha256').update(bytes).digest('hex');

    const result = runFirmwareDigestCli(['--path', 'projects/app.bin'], { cwd: dir, now: 42 });
    assert.equal(result.exit, 0);
    const digest = (result.output as { digest: { sha256: string; byteLength: number; computedAt: number } }).digest;
    assert.equal(digest.sha256, expected);
    assert.equal(digest.byteLength, 5);
    assert.equal(digest.computedAt, 42);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
