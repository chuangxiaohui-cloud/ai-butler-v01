import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { discoverLtspiceSchematics, inspectLtspiceSchematic, runLtspiceSimulation } from './ltspice.js';

const ASC = [
  'Version 4',
  'SHEET 1 880',
  'WIRE 0 0 100 0',
  'SYMBOL Resistor 100 100 R0',
  'SYMATTR InstName R1',
  'SYMATTR Value 10k',
  'SYMBOL Capacitor 200 100 R0',
  'SYMATTR InstName C1',
  'SYMATTR Value 100n',
  'SYMBOL NMOS 300 100 R0',
  'SYMATTR InstName M1',
  'SYMATTR Value 2N7000',
  'TEXT 0 0 Left 2 !.tran 0 10m 0 1u',
  'TEXT 0 100 Left 2 !.include model.lib',
  'TEXT 0 200 Left 2 !.lib vendor.lib',
].join('\r\n');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ltspice-mcp-'));
  const projectRoot = join(root, 'projects', 'analog');
  const schematicPath = join(projectRoot, 'demo.asc');
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(schematicPath, ASC, 'utf8');
  return { root, projectRoot, schematicPath };
}

test('ltspice: 发现沙箱内 asc 并拒绝越界与外部符号链接', () => {
  const { root, schematicPath } = fixture();
  const outside = join(root, 'outside.asc');
  const alias = join(root, 'projects', 'outside-link.asc');
  writeFileSync(outside, ASC, 'utf8');
  let linked = false;
  try {
    try {
      symlinkSync(outside, alias, 'file');
      linked = true;
    } catch {
      // Windows 未授予创建符号链接权限时，仍验证常规沙箱边界。
    }
    assert.deepEqual(discoverLtspiceSchematics('projects', root), [join('projects', 'analog', 'demo.asc')]);
    assert.throws(() => discoverLtspiceSchematics('..', root), /越界/);
    if (linked) {
      assert.equal(discoverLtspiceSchematics('projects', root).some((path) => path.includes('outside-link')), false);
      assert.throws(() => inspectLtspiceSchematic({ schematicPath: alias, workspaceRoot: root }), /越界/);
    }
    assert.ok(existsSync(schematicPath));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ltspice: UTF-8 原理图只读提取元件、模型引用与仿真指令', () => {
  const { root, schematicPath } = fixture();
  const before = readFileSync(schematicPath);
  try {
    const result = inspectLtspiceSchematic({
      schematicPath,
      workspaceRoot: root,
      executable: process.execPath,
    });
    assert.equal(result.schematicPath, schematicPath);
    assert.equal(result.encoding, 'utf8');
    assert.equal(result.componentCount, 3);
    assert.deepEqual(result.symbolKinds, ['Resistor', 'Capacitor', 'NMOS']);
    assert.deepEqual(result.instanceNames, ['R1', 'C1', 'M1']);
    assert.deepEqual(result.simulationDirectives, ['.tran 0 10m 0 1u']);
    assert.deepEqual(result.includeDirectives, ['.include model.lib', '.lib vendor.lib']);
    assert.deepEqual(result.configurationDiagnostics, []);
    assert.equal(result.executableAvailable, true);
    assert.equal(result.simulationExecuted, false);
    assert.deepEqual(readFileSync(schematicPath), before);
    assert.deepEqual(
      readdirSync(join(root, 'projects', 'analog')).filter((name) => /\.(raw|log|net)$/i.test(name)),
      [],
      '只读盘点不得生成 LTspice 仿真产物',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ltspice: UTF-16LE BOM 原理图可读取且缺少仿真指令时给出诊断', () => {
  const { root, schematicPath } = fixture();
  const utf16Path = join(root, 'projects', 'analog', 'utf16.asc');
  writeFileSync(utf16Path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([
    'Version 4',
    'SYMBOL Voltage 0 0 R0',
    'SYMATTR InstName V1',
    'SYMATTR Value 5',
  ].join('\r\n'), 'utf16le')]));
  try {
    const result = inspectLtspiceSchematic({ schematicPath: utf16Path, workspaceRoot: root });
    assert.equal(result.encoding, 'utf16le');
    assert.equal(result.componentCount, 1);
    assert.deepEqual(result.symbolKinds, ['Voltage']);
    assert.deepEqual(result.instanceNames, ['V1']);
    assert.deepEqual(result.simulationDirectives, []);
    assert.deepEqual(result.configurationDiagnostics, [{
      code: 'simulation_command_missing',
      severity: 'warning',
      message: '未发现仿真指令；本工具不会猜测或写入仿真参数。',
    }]);
    assert.equal(result.simulationExecuted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  void schematicPath;
});

test('E413: 先 -netlist 再固定 -b .net，并报告沙箱内产物', async () => {
  const { root, schematicPath } = fixture();
  const executable = join(root, 'fake-ltspice.exe');
  const netPath = join(root, 'projects', 'analog', 'demo.net');
  writeFileSync(executable, '', 'utf8');
  const calls: string[][] = [];
  try {
    const result = await runLtspiceSimulation({
      schematicPath,
      workspaceRoot: root,
      executable,
      runner: async (_exe, args, options) => {
        calls.push([...args]);
        if (args[0] === '-netlist') {
          assert.deepEqual(args, ['-netlist', schematicPath]);
          writeFileSync(netPath, '* netlist\n.end\n', 'utf8');
          return { stdout: 'netlisted', stderr: '', exitCode: 0, durationMs: 5, timedOut: false };
        }
        assert.deepEqual(args, ['-b', netPath]);
        writeFileSync(join(options.cwd, 'demo.raw'), 'raw-bytes', 'utf8');
        writeFileSync(join(options.cwd, 'demo.log'), 'log-bytes', 'utf8');
        return { stdout: 'ok', stderr: '', exitCode: 0, durationMs: 12, timedOut: false };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.simulationExecuted, true);
    assert.deepEqual(calls, [['-netlist', schematicPath], ['-b', netPath]]);
    assert.deepEqual(result.batchArgs, ['-b', netPath]);
    assert.equal(result.outputFiles.length, 3);
    assert.ok(result.outputFiles.every((item) => item.path.startsWith('projects')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E413: 缺少仿真指令时拒绝启动', async () => {
  const { root, projectRoot } = fixture();
  const executable = join(root, 'fake-ltspice.exe');
  writeFileSync(executable, '', 'utf8');
  const bare = join(projectRoot, 'bare.asc');
  writeFileSync(bare, 'Version 4\nSYMBOL Resistor 0 0 R0\nSYMATTR InstName R1\n', 'utf8');
  try {
    await assert.rejects(
      () => runLtspiceSimulation({
        schematicPath: bare,
        workspaceRoot: root,
        executable,
        runner: async () => {
          throw new Error('不应启动');
        },
      }),
      /缺少仿真指令/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
