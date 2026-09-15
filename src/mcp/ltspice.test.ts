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

import { discoverLtspiceSchematics, inspectLtspiceSchematic } from './ltspice.js';

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
