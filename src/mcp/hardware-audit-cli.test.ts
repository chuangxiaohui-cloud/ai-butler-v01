/**
 * E427：硬件审计只读 CLI 单测。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { HardwareAuditStore } from './hardware-audit.js';
import { runHardwareAuditCli } from './hardware-audit-cli.js';
import type { HardwareGateDecision } from './hardware-capability.js';

function decision(
  overrides: Partial<HardwareGateDecision> & Pick<HardwareGateDecision, 'allowed' | 'action' | 'message'>,
): HardwareGateDecision {
  return {
    allowed: overrides.allowed,
    action: overrides.action,
    reason: overrides.reason,
    message: overrides.message,
    timeoutMs: overrides.timeoutMs ?? 1000,
    audit: {
      deviceId: overrides.audit?.deviceId ?? 'DEV-1',
      port: overrides.audit?.port ?? null,
      firmwareSha256: overrides.audit?.firmwareSha256 ?? null,
      perFlashConfirmed: overrides.audit?.perFlashConfirmed ?? false,
      serialMode: overrides.audit?.serialMode ?? null,
    },
  };
}

test('E427: 空账本与非法参数', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e427-empty-'));
  try {
    const auditPath = join(dir, 'hardware-audit.jsonl');
    const empty = runHardwareAuditCli([], { auditPath });
    assert.equal(empty.exit, 0);
    assert.equal((empty.output as { total: number }).total, 0);

    const badLimit = runHardwareAuditCli(['--limit', '0'], { auditPath });
    assert.equal(badLimit.exit, 1);

    const badAction = runHardwareAuditCli(['--action', 'write'], { auditPath });
    assert.equal(badAction.exit, 1);

    const badAllowed = runHardwareAuditCli(['--allowed', 'yes'], { auditPath });
    assert.equal(badAllowed.exit, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E427: limit 倒序与 action/allowed 过滤', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e427-filter-'));
  try {
    const auditPath = join(dir, 'hardware-audit.jsonl');
    const store = new HardwareAuditStore(auditPath);
    store.append(decision({
      allowed: false,
      action: 'flash',
      reason: 'device_not_authorized',
      message: 'denied-1',
    }));
    store.append(decision({
      allowed: true,
      action: 'serial_read',
      message: 'ok-serial',
      audit: {
        deviceId: 'UART-1',
        port: 'COM3',
        firmwareSha256: null,
        perFlashConfirmed: false,
        serialMode: 'read_only',
      },
    }));
    store.append(decision({
      allowed: true,
      action: 'flash',
      message: 'ok-flash',
      audit: {
        deviceId: 'DEV-2',
        port: null,
        firmwareSha256: 'abc',
        perFlashConfirmed: true,
        serialMode: null,
      },
    }));
    store.close();

    const limited = runHardwareAuditCli(['--limit', '2'], { auditPath });
    assert.equal(limited.exit, 0);
    const limOut = limited.output as { total: number; shown: number; events: { message: string }[] };
    assert.equal(limOut.total, 3);
    assert.equal(limOut.shown, 2);
    assert.equal(limOut.events[0]?.message, 'ok-flash');
    assert.equal(limOut.events[1]?.message, 'ok-serial');

    const denied = runHardwareAuditCli(['--allowed', 'false'], { auditPath });
    assert.equal((denied.output as { total: number }).total, 1);
    assert.equal((denied.output as { events: { message: string }[] }).events[0]?.message, 'denied-1');

    const serial = runHardwareAuditCli(['--action', 'serial_read'], { auditPath });
    assert.equal((serial.output as { total: number }).total, 1);
    assert.equal((serial.output as { events: { action: string }[] }).events[0]?.action, 'serial_read');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E427: 损坏行忽略', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e427-corrupt-'));
  try {
    const auditPath = join(dir, 'hardware-audit.jsonl');
    writeFileSync(
      auditPath,
      [
        'not-json',
        JSON.stringify({
          ts: '2026-09-17T00:00:00.000Z',
          allowed: true,
          action: 'flash',
          message: 'ok',
          deviceId: 'D',
          port: null,
          firmwareSha256: null,
          timeoutMs: 1,
        }),
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = runHardwareAuditCli([], { auditPath });
    assert.equal(result.exit, 0);
    assert.equal((result.output as { total: number }).total, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
