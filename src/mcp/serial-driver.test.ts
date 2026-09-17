/**
 * E421：串口只读驱动单测（注入 reader，零真实硬件）。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { DeviceAuthStore } from './device-auth.js';
import { evaluateHardwareGate } from './hardware-gate.js';
import {
  normalizeSerialBaud,
  normalizeSerialPort,
  runAuthorizedSerialRead,
  type SerialReader,
} from './serial-driver.js';

test('E421: 端口与波特率白名单校验', () => {
  assert.equal(normalizeSerialPort('com3'), 'COM3');
  assert.equal(normalizeSerialPort('/dev/ttyUSB0'), '/dev/ttyUSB0');
  assert.throws(() => normalizeSerialPort('COM'), /串口名非法/);
  assert.throws(() => normalizeSerialPort('/dev/tty'), /串口名非法/);
  assert.equal(normalizeSerialBaud(undefined), 115200);
  assert.equal(normalizeSerialBaud(9600), 9600);
  assert.throws(() => normalizeSerialBaud(12345), /波特率不在白名单/);
});

test('E421: 门禁未通过时拒绝打开', async () => {
  let opened = false;
  const reader: SerialReader = async () => {
    opened = true;
    return { data: '', bytesRead: 0, durationMs: 1, timedOut: false };
  };
  await assert.rejects(
    () =>
      runAuthorizedSerialRead({
        gate: {
          allowed: false,
          action: 'serial_read',
          reason: 'device_not_authorized',
          message: 'denied',
          timeoutMs: 1000,
          audit: {
            deviceId: null,
            port: 'COM3',
            firmwareSha256: null,
            perFlashConfirmed: false,
            serialMode: 'read_only',
          },
        },
        port: 'COM3',
        reader,
      }),
    /门禁未通过/,
  );
  assert.equal(opened, false);
});

test('E421: 门禁通过后注入 reader 只读；默认 reader 拒绝打开', async () => {
  const authDir = mkdtempSync(join(tmpdir(), 'e421-auth-'));
  try {
    const devices = new DeviceAuthStore(join(authDir, 'device-auth.jsonl'));
    devices.authorize('UART-E421', 'user_whitelist');
    const gate = evaluateHardwareGate(
      {
        action: 'serial_read',
        deviceId: 'UART-E421',
        port: 'COM5',
        serialMode: 'read_only',
      },
      { devices },
    );
    assert.equal(gate.allowed, true);

    let opened = 0;
    const reader: SerialReader = async (req) => {
      opened += 1;
      assert.equal(req.port, 'COM5');
      assert.equal(req.baudRate, 115200);
      return { data: 'boot ok\n', bytesRead: 8, durationMs: 2, timedOut: false };
    };
    const ok = await runAuthorizedSerialRead({
      gate,
      port: 'COM5',
      reader,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.serialReadExecuted, true);
    assert.equal(ok.bytesRead, 8);
    assert.equal(opened, 1);

    await assert.rejects(
      () => runAuthorizedSerialRead({ gate, port: 'COM5' }),
      /默认不打开真实串口/,
    );
  } finally {
    rmSync(authDir, { recursive: true, force: true });
  }
});
