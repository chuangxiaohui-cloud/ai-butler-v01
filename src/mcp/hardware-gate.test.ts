import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { DeviceAuthStore } from './device-auth.js';
import { computeFirmwareDigest } from './firmware-digest.js';
import { HardwareAuditStore } from './hardware-audit.js';
import {
  isForbiddenAuthSource,
  isHardwareCapabilityQuery,
  isHardwareFlashQuery,
  isHardwareSerialQuery,
} from './hardware-capability.js';
import { evaluateHardwareGate } from './hardware-gate.js';
import { defaultPortProbe } from './port-probe.js';

test('E411: 默认无设备授权时 flash 零通过', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hw-gate-'));
  try {
    const devices = new DeviceAuthStore(join(dir, 'device-auth.jsonl'));
    const audit = new HardwareAuditStore(join(dir, 'hardware-audit.jsonl'));
    const decision = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'STLINK-001',
        port: null,
        firmware: {
          path: 'projects/a.bin',
          sha256: 'a'.repeat(64),
          byteLength: 1,
          computedAt: 1,
        },
        perFlashConfirmed: true,
      },
      { devices, audit },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'device_not_authorized');
    assert.equal(audit.list().length, 1);
    assert.equal(audit.list()[0]?.allowed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E411: E410 夹具来源不能授权设备，也不能作为门禁继承', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hw-auth-'));
  try {
    const devices = new DeviceAuthStore(join(dir, 'device-auth.jsonl'));
    assert.throws(
      () => devices.authorize('STLINK-001', 'e410_fixture'),
      /禁止来源/,
    );
    assert.equal(isForbiddenAuthSource('e410_fixture'), true);
    assert.equal(isForbiddenAuthSource('build_approval'), true);

    devices.authorize('STLINK-001', 'user_whitelist', '板子A');
    const decision = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'STLINK-001',
        port: null,
        firmware: {
          path: 'projects/a.bin',
          sha256: 'b'.repeat(64),
          byteLength: 2,
          computedAt: 2,
        },
        perFlashConfirmed: true,
        authorizationSource: 'e410_fixture',
      },
      { devices },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'forbidden_auth_source');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E411: 已授权仍须每次 flash 独立确认；构建批准不能复用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hw-flash-'));
  try {
    const devices = new DeviceAuthStore(join(dir, 'device-auth.jsonl'));
    devices.authorize('JLINK-9', 'user_whitelist');
    const denied = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'JLINK-9',
        port: null,
        firmware: {
          path: 'projects/fw.bin',
          sha256: 'c'.repeat(64),
          byteLength: 8,
          computedAt: 3,
        },
        perFlashConfirmed: false,
        authorizationSource: 'build_approval',
      },
      { devices },
    );
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'forbidden_auth_source');

    const needConfirm = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'JLINK-9',
        port: null,
        firmware: {
          path: 'projects/fw.bin',
          sha256: 'c'.repeat(64),
          byteLength: 8,
          computedAt: 3,
        },
        perFlashConfirmed: false,
      },
      { devices },
    );
    assert.equal(needConfirm.allowed, false);
    assert.equal(needConfirm.reason, 'flash_confirmation_required');

    const ok = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'JLINK-9',
        port: 'COM3',
        firmware: {
          path: 'projects/fw.bin',
          sha256: 'c'.repeat(64),
          byteLength: 8,
          computedAt: 3,
        },
        perFlashConfirmed: true,
      },
      { devices, portProbe: defaultPortProbe },
    );
    assert.equal(ok.allowed, true);
    assert.match(ok.message, /不执行烧录/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E411: 串口默认只读；写操作即使确认也拒绝发送', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hw-serial-'));
  try {
    const devices = new DeviceAuthStore(join(dir, 'device-auth.jsonl'));
    devices.authorize('UART-BOARD-1', 'user_whitelist');
    const readOk = evaluateHardwareGate(
      {
        action: 'serial_read',
        deviceId: 'UART-BOARD-1',
        port: 'COM5',
        serialMode: 'read_only',
      },
      { devices },
    );
    assert.equal(readOk.allowed, true);
    assert.match(readOk.message, /未打开端口|不打开串口/);

    const writeDenied = evaluateHardwareGate(
      {
        action: 'serial_write',
        deviceId: 'UART-BOARD-1',
        port: 'COM5',
        serialMode: 'write',
        serialWriteConfirmed: true,
      },
      { devices },
    );
    assert.equal(writeDenied.allowed, false);
    assert.equal(writeDenied.reason, 'serial_write_denied');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E411: 端口占用探针可注入；busy 则拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hw-port-'));
  try {
    const devices = new DeviceAuthStore(join(dir, 'device-auth.jsonl'));
    devices.authorize('DEV-2', 'user_whitelist');
    const decision = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'DEV-2',
        port: 'COM9',
        firmware: {
          path: 'projects/x.bin',
          sha256: 'd'.repeat(64),
          byteLength: 4,
          computedAt: 4,
        },
        perFlashConfirmed: true,
      },
      {
        devices,
        portProbe: (port) => ({ status: 'busy', port, reason: '被其他进程占用' }),
      },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'port_busy');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E411: 固件摘要只读沙箱文件并产出 SHA-256', () => {
  const root = mkdtempSync(join(tmpdir(), 'hw-fw-'));
  const projects = join(root, 'projects');
  mkdirSync(projects, { recursive: true });
  const firmwarePath = join(projects, 'app.bin');
  writeFileSync(firmwarePath, Buffer.from([1, 2, 3, 4]));
  const prev = process.cwd();
  try {
    process.chdir(root);
    const result = computeFirmwareDigest('projects/app.bin', 100);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.digest.byteLength, 4);
      assert.equal(result.digest.sha256.length, 64);
      assert.equal(result.digest.computedAt, 100);
    }
  } finally {
    process.chdir(prev);
    rmSync(root, { recursive: true, force: true });
  }
});

test('E411: 查询识别与取消/超时语义', () => {
  assert.equal(isHardwareFlashQuery('把固件烧录到板子'), true);
  assert.equal(isHardwareSerialQuery('读一下 COM3 串口日志'), true);
  assert.equal(isHardwareCapabilityQuery('flash demo.hex'), true);
  assert.equal(isHardwareFlashQuery('编译 Keil 工程'), false);

  const dir = mkdtempSync(join(tmpdir(), 'hw-cancel-'));
  try {
    const devices = new DeviceAuthStore(join(dir, 'device-auth.jsonl'));
    devices.authorize('D1', 'user_whitelist');
    const cancelled = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'D1',
        port: null,
        cancelled: true,
        perFlashConfirmed: true,
        firmware: {
          path: 'projects/a.bin',
          sha256: 'e'.repeat(64),
          byteLength: 1,
          computedAt: 1,
        },
      },
      { devices },
    );
    assert.equal(cancelled.reason, 'cancelled');
    const timedOut = evaluateHardwareGate(
      {
        action: 'serial_read',
        deviceId: 'D1',
        port: 'COM1',
        timedOut: true,
      },
      { devices },
    );
    assert.equal(timedOut.reason, 'timed_out');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
