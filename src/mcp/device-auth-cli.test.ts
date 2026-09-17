/**
 * E426：设备白名单 CLI / DeviceAuthStore.listCurrent 单测。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { DeviceAuthStore } from './device-auth.js';
import { runDeviceAuthCli } from './device-auth-cli.js';

test('E426: listCurrent 只返回当前有效授权', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e426-auth-'));
  try {
    const path = join(dir, 'device-auth.jsonl');
    const store = new DeviceAuthStore(path);
    store.authorize('DEV-A', 'user_whitelist', '板A');
    store.authorize('DEV-B', 'user_whitelist');
    store.revoke('DEV-A');
    const current = store.listCurrent();
    assert.equal(current.length, 1);
    assert.equal(current[0]?.deviceId, 'DEV-B');
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E426: CLI list/authorize/revoke 与禁用来源', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e426-cli-'));
  try {
    const authPath = join(dir, 'device-auth.jsonl');

    const empty = runDeviceAuthCli(['--list'], { authPath });
    assert.equal(empty.exit, 0);
    assert.equal((empty.output as { count: number }).count, 0);

    const badMode = runDeviceAuthCli(['--list', '--authorize'], { authPath });
    assert.equal(badMode.exit, 1);

    const forbidden = runDeviceAuthCli(
      ['--authorize', '--device', 'STLINK-1', '--source', 'e410_fixture'],
      { authPath },
    );
    assert.equal(forbidden.exit, 1);
    assert.match(String((forbidden.output as { error: string }).error), /禁止来源/);

    const auth = runDeviceAuthCli(
      ['--authorize', '--device', 'STLINK-1', '--label', '调试板'],
      { authPath },
    );
    assert.equal(auth.exit, 0);
    assert.equal((auth.output as { authorized: boolean }).authorized, true);

    const listed = runDeviceAuthCli(['--list'], { authPath });
    assert.equal(listed.exit, 0);
    assert.equal((listed.output as { count: number }).count, 1);
    assert.equal((listed.output as { devices: { deviceId: string }[] }).devices[0]?.deviceId, 'STLINK-1');

    const revoked = runDeviceAuthCli(['--revoke', '--device', 'STLINK-1'], { authPath });
    assert.equal(revoked.exit, 0);
    assert.equal((revoked.output as { authorized: boolean }).authorized, false);

    const after = runDeviceAuthCli(['--list'], { authPath });
    assert.equal((after.output as { count: number }).count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
