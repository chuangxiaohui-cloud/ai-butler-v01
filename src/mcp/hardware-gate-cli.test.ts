/**
 * E429：硬件门禁预检 CLI 单测（零硬件）。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { DeviceAuthStore } from './device-auth.js';
import { HardwareAuditStore } from './hardware-audit.js';
import { runHardwareGateCli } from './hardware-gate-cli.js';

test('E429: 参数非法与缺设备拒绝', () => {
  const bad = runHardwareGateCli([]);
  assert.equal(bad.exit, 1);

  const dir = mkdtempSync(join(tmpdir(), 'e429-deny-'));
  try {
    const authPath = join(dir, 'device-auth.jsonl');
    const auditPath = join(dir, 'hardware-audit.jsonl');
    const denied = runHardwareGateCli(
      ['--action', 'serial_read', '--device', 'NOPE', '--port', 'COM3'],
      { deviceAuthPath: authPath, auditPath },
    );
    assert.equal(denied.exit, 1);
    assert.equal((denied.output as { decision: { reason?: string } }).decision.reason, 'device_not_authorized');
    const audit = new HardwareAuditStore(auditPath);
    assert.equal(audit.list().length, 1);
    audit.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E429: serial_read 授权通过；--no-audit 不落盘', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e429-ok-'));
  try {
    const authPath = join(dir, 'device-auth.jsonl');
    const auditPath = join(dir, 'hardware-audit.jsonl');
    const devices = new DeviceAuthStore(authPath);
    devices.authorize('UART-1', 'user_whitelist');
    devices.close();

    const ok = runHardwareGateCli(
      ['--action', 'serial_read', '--device', 'UART-1', '--port', 'COM3', '--no-audit'],
      { deviceAuthPath: authPath, auditPath },
    );
    assert.equal(ok.exit, 0);
    assert.equal((ok.output as { ok: boolean; audited: boolean }).ok, true);
    assert.equal((ok.output as { audited: boolean }).audited, false);
    const audit = new HardwareAuditStore(auditPath);
    assert.equal(audit.list().length, 0);
    audit.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E429: flash 缺确认拒绝；带摘要与确认可通过契约', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e429-flash-'));
  try {
    mkdirSync(join(dir, 'projects'), { recursive: true });
    writeFileSync(join(dir, 'projects', 'app.bin'), Buffer.from([1, 2, 3]));
    const authPath = join(dir, 'device-auth.jsonl');
    const devices = new DeviceAuthStore(authPath);
    devices.authorize('STLINK-1', 'user_whitelist');
    devices.close();

    const needConfirm = runHardwareGateCli(
      ['--action', 'flash', '--device', 'STLINK-1', '--path', 'projects/app.bin', '--no-audit'],
      { cwd: dir, deviceAuthPath: authPath, now: 10 },
    );
    assert.equal(needConfirm.exit, 1);
    assert.equal(
      (needConfirm.output as { decision: { reason?: string } }).decision.reason,
      'flash_confirmation_required',
    );

    const allowed = runHardwareGateCli(
      [
        '--action', 'flash',
        '--device', 'STLINK-1',
        '--path', 'projects/app.bin',
        '--per-flash-confirmed',
        '--no-audit',
      ],
      { cwd: dir, deviceAuthPath: authPath, now: 11 },
    );
    assert.equal(allowed.exit, 0);
    assert.equal((allowed.output as { decision: { allowed: boolean } }).decision.allowed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
