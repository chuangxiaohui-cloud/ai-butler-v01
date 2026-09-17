/**
 * E420：flash 驱动单测（注入 runner，零真实硬件）。
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { DeviceAuthStore } from './device-auth.js';
import {
  buildFlashArgs,
  normalizeFlashAddress,
  runAuthorizedFlash,
  type FlashRunner,
} from './flash-driver.js';
import { evaluateHardwareGate } from './hardware-gate.js';

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

test('E420: buildFlashArgs 仅允许白名单模板与合法地址', () => {
  assert.deepEqual(buildFlashArgs('st-flash', '/fw.bin', { flashAddress: '0x08000000' }), [
    'write',
    '/fw.bin',
    '0x08000000',
  ]);
  assert.deepEqual(buildFlashArgs('pyocd', '/fw.bin'), ['flash', '/fw.bin']);
  assert.equal(normalizeFlashAddress(undefined), '0x08000000');
  assert.throws(() => normalizeFlashAddress('08000000'), /烧录地址非法/);
  assert.throws(() => normalizeFlashAddress('0xGG'), /烧录地址非法/);
});

test('E422: openocd 固定 -f/-c 模板；非法 cfg 拒绝', () => {
  assert.deepEqual(
    buildFlashArgs('openocd', '/projects/fw.elf', { openocdCfg: 'board/stm32f4discovery.cfg' }),
    [
      '-f',
      'board/stm32f4discovery.cfg',
      '-c',
      'program {/projects/fw.elf} verify reset exit',
    ],
  );
  assert.deepEqual(
    buildFlashArgs('openocd', '/projects/fw.bin', {
      openocdInterfaceCfg: 'interface/stlink.cfg',
      openocdTargetCfg: 'target/stm32f1x.cfg',
      flashAddress: '0x08000000',
    }),
    [
      '-f',
      'interface/stlink.cfg',
      '-f',
      'target/stm32f1x.cfg',
      '-c',
      'program {/projects/fw.bin} 0x08000000 verify reset exit',
    ],
  );
  assert.throws(
    () => buildFlashArgs('openocd', '/fw.elf', { openocdCfg: '../evil.cfg' }),
    /配置路径非法/,
  );
  assert.throws(
    () => buildFlashArgs('openocd', '/fw.elf', { openocdCfg: '/abs/path.cfg' }),
    /配置路径非法/,
  );
  assert.throws(
    () => buildFlashArgs('openocd', '/fw.elf', {}),
    /须提供 openocdCfg/,
  );
  assert.throws(
    () =>
      buildFlashArgs('openocd', '/fw.elf', {
        openocdCfg: 'board/a.cfg',
        openocdInterfaceCfg: 'interface/stlink.cfg',
      }),
    /不可同时指定/,
  );
  assert.throws(
    () => buildFlashArgs('openocd', '/fw"; shutdown', { openocdCfg: 'board/a.cfg' }),
    /非法字符/,
  );
});

test('E423: dfu-util / jlink 固定模板与白名单', () => {
  assert.deepEqual(buildFlashArgs('dfu-util', '/fw.bin'), ['-a', '0', '-D', '/fw.bin']);
  assert.deepEqual(
    buildFlashArgs('dfu-util', '/fw.bin', { dfuAlt: 1, flashAddress: '0x08000000' }),
    ['-a', '1', '-s', '0x08000000:leave', '-D', '/fw.bin'],
  );
  assert.throws(() => buildFlashArgs('dfu-util', '/fw.bin', { dfuAlt: -1 }), /alt 非法/);
  assert.throws(() => buildFlashArgs('dfu-util', '/fw.bin', { dfuAlt: 1.5 }), /alt 非法/);

  assert.deepEqual(
    buildFlashArgs('jlink', '/fw.hex', {
      jlinkDevice: 'STM32F103C8',
      jlinkInterface: 'SWD',
      jlinkSpeed: 4000,
      jlinkCommanderScriptPath: '/tmp/flash.jlink',
    }),
    [
      '-device', 'STM32F103C8',
      '-if', 'SWD',
      '-speed', '4000',
      '-autoconnect', '1',
      '-CommanderScript', '/tmp/flash.jlink',
    ],
  );
  assert.throws(
    () => buildFlashArgs('jlink', '/fw.hex', { jlinkDevice: 'STM32F103C8' }),
    /CommanderScript/,
  );
  assert.throws(
    () =>
      buildFlashArgs('jlink', '/fw.hex', {
        jlinkDevice: '../evil',
        jlinkCommanderScriptPath: '/tmp/x.jlink',
      }),
    /设备名非法/,
  );
  assert.throws(
    () =>
      buildFlashArgs('jlink', '/fw.hex', {
        jlinkDevice: 'STM32F103C8',
        jlinkSpeed: 1234,
        jlinkCommanderScriptPath: '/tmp/x.jlink',
      }),
    /速度不在白名单/,
  );
  assert.throws(
    () =>
      buildFlashArgs('jlink', '/fw.hex', {
        jlinkDevice: 'STM32F103C8',
        jlinkInterface: 'SPI' as 'SWD',
        jlinkCommanderScriptPath: '/tmp/x.jlink',
      }),
    /接口非法/,
  );
});

test('E423: jlink 门禁通过后驱动生成 CommanderScript 且注入 runner 可见 argv', async () => {
  const root = mkdtempSync(join(process.cwd(), 'projects', 'e423-jlink-'));
  const authDir = mkdtempSync(join(tmpdir(), 'e423-auth-'));
  try {
    mkdirSync(root, { recursive: true });
    const fwPath = join(root, 'app.hex');
    const payload = Buffer.from('E423-jlink');
    writeFileSync(fwPath, payload);
    const digest = sha256Hex(payload);
    const devices = new DeviceAuthStore(join(authDir, 'device-auth.jsonl'));
    devices.authorize('JLINK-E423', 'user_whitelist');
    const gate = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'JLINK-E423',
        port: null,
        firmware: {
          path: fwPath,
          sha256: digest,
          byteLength: payload.byteLength,
          computedAt: Date.now(),
        },
        perFlashConfirmed: true,
      },
      { devices },
    );
    assert.equal(gate.allowed, true);
    let seen: string[] = [];
    const runner: FlashRunner = async (_exe, args) => {
      seen = args;
      return { stdout: 'ok', stderr: '', exitCode: 0, durationMs: 1, timedOut: false };
    };
    const ok = await runAuthorizedFlash({
      gate,
      firmwarePath: fwPath,
      expectedSha256: digest,
      executable: process.execPath,
      toolKind: 'jlink',
      jlinkDevice: 'STM32F407VG',
      jlinkSpeed: 4000,
      runner,
      workspaceRoot: process.cwd(),
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.toolKind, 'jlink');
    assert.equal(seen[0], '-device');
    assert.equal(seen[1], 'STM32F407VG');
    assert.equal(seen[2], '-if');
    assert.equal(seen[3], 'SWD');
    assert.equal(seen[8], '-CommanderScript');
    assert.match(seen[9]!, /flash\.jlink$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(authDir, { recursive: true, force: true });
  }
});

test('E422: openocd 门禁通过后注入 runner 可见固定 argv', async () => {
  const root = mkdtempSync(join(process.cwd(), 'projects', 'e422-openocd-'));
  const authDir = mkdtempSync(join(tmpdir(), 'e422-auth-'));
  try {
    mkdirSync(root, { recursive: true });
    const fwPath = join(root, 'app.elf');
    const payload = Buffer.from('E422-openocd');
    writeFileSync(fwPath, payload);
    const digest = sha256Hex(payload);
    const devices = new DeviceAuthStore(join(authDir, 'device-auth.jsonl'));
    devices.authorize('OCD-E422', 'user_whitelist');
    const gate = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'OCD-E422',
        port: null,
        firmware: {
          path: fwPath,
          sha256: digest,
          byteLength: payload.byteLength,
          computedAt: Date.now(),
        },
        perFlashConfirmed: true,
      },
      { devices },
    );
    assert.equal(gate.allowed, true);
    let seen: string[] = [];
    const runner: FlashRunner = async (_exe, args) => {
      seen = args;
      return { stdout: 'ok', stderr: '', exitCode: 0, durationMs: 1, timedOut: false };
    };
    const ok = await runAuthorizedFlash({
      gate,
      firmwarePath: fwPath,
      expectedSha256: digest,
      executable: process.execPath,
      toolKind: 'openocd',
      openocdInterfaceCfg: 'interface/cmsis-dap.cfg',
      openocdTargetCfg: 'target/stm32f4x.cfg',
      runner,
      workspaceRoot: process.cwd(),
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.toolKind, 'openocd');
    assert.equal(seen[0], '-f');
    assert.equal(seen[1], 'interface/cmsis-dap.cfg');
    assert.equal(seen[2], '-f');
    assert.equal(seen[3], 'target/stm32f4x.cfg');
    assert.equal(seen[4], '-c');
    assert.match(seen[5]!, /^program \{.*app\.elf\} verify reset exit$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(authDir, { recursive: true, force: true });
  }
});

test('E420: 门禁未通过时 flash 驱动拒绝 spawn', async () => {
  let spawned = false;
  const runner: FlashRunner = async () => {
    spawned = true;
    return { stdout: '', stderr: '', exitCode: 0, durationMs: 1, timedOut: false };
  };
  await assert.rejects(
    () =>
      runAuthorizedFlash({
        gate: {
          allowed: false,
          action: 'flash',
          reason: 'device_not_authorized',
          message: 'denied',
          timeoutMs: 1000,
          audit: {
            deviceId: null,
            port: null,
            firmwareSha256: null,
            perFlashConfirmed: true,
            serialMode: null,
          },
        },
        firmwarePath: 'projects/x.bin',
        expectedSha256: 'a'.repeat(64),
        executable: process.execPath,
        runner,
      }),
    /门禁未通过/,
  );
  assert.equal(spawned, false);
});

test('E420: 门禁通过后注入 runner 执行；摘要不符拒绝', async () => {
  const root = mkdtempSync(join(process.cwd(), 'projects', 'e420-flash-'));
  const authDir = mkdtempSync(join(tmpdir(), 'e420-auth-'));
  try {
    mkdirSync(root, { recursive: true });
    const fwPath = join(root, 'app.bin');
    const payload = Buffer.from('E420-firmware-bytes');
    writeFileSync(fwPath, payload);
    const digest = sha256Hex(payload);

    const devices = new DeviceAuthStore(join(authDir, 'device-auth.jsonl'));
    devices.authorize('JLINK-E420', 'user_whitelist');
    const gate = evaluateHardwareGate(
      {
        action: 'flash',
        deviceId: 'JLINK-E420',
        port: null,
        firmware: {
          path: fwPath,
          sha256: digest,
          byteLength: payload.byteLength,
          computedAt: Date.now(),
        },
        perFlashConfirmed: true,
      },
      { devices },
    );
    assert.equal(gate.allowed, true);

    const seen: string[][] = [];
    const runner: FlashRunner = async (_exe, args) => {
      seen.push(args);
      return { stdout: 'ok', stderr: '', exitCode: 0, durationMs: 2, timedOut: false };
    };

    const ok = await runAuthorizedFlash({
      gate,
      firmwarePath: fwPath,
      expectedSha256: digest,
      executable: process.execPath,
      toolKind: 'st-flash',
      flashAddress: '0x08000000',
      runner,
      workspaceRoot: process.cwd(),
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.flashExecuted, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]![0], 'write');
    assert.match(seen[0]![1]!, /app\.bin$/);
    assert.equal(seen[0]![2], '0x08000000');

    await assert.rejects(
      () =>
        runAuthorizedFlash({
          gate,
          firmwarePath: fwPath,
          expectedSha256: 'b'.repeat(64),
          executable: process.execPath,
          runner,
          workspaceRoot: process.cwd(),
        }),
      /摘要与门禁记录不一致/,
    );
    assert.equal(seen.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(authDir, { recursive: true, force: true });
  }
});
