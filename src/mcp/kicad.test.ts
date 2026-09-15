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
import { basename, dirname, join } from 'node:path';
import test from 'node:test';

import { discoverKiCadProjects, inspectKiCadProject, runKiCadErc } from './kicad.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kicad-mcp-'));
  const projectRoot = join(root, 'projects', 'board');
  const projectPath = join(projectRoot, 'demo.kicad_pro');
  const schematicPath = join(projectRoot, 'demo.kicad_sch');
  const boardPath = join(projectRoot, 'demo.kicad_pcb');
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(projectPath, JSON.stringify({ board: {}, meta: { filename: 'demo' } }), 'utf8');
  writeFileSync(schematicPath, [
    '(kicad_sch (version 20231120) (generator eeschema)',
    '  (symbol (lib_id "Device:R") (at 10 10) (unit 1))',
    '  (symbol (lib_id "Device:C") (at 20 20) (unit 1))',
    '  (label "VCC" (at 10 10) (effects (font (size 1 1))))',
    '  (global_label "GND" (shape input) (at 20 20))',
    '  (sheet (at 0 0) (size 10 10))',
    ')',
  ].join('\n'), 'utf8');
  writeFileSync(boardPath, '(kicad_pcb (version 20240108) (generator pcbnew))', 'utf8');
  return { root, projectRoot, projectPath, schematicPath, boardPath };
}

test('kicad: 只发现沙箱内工程文件并跳过越界符号链接', () => {
  const { root, projectPath, schematicPath } = fixture();
  const outside = join(root, 'outside.kicad_sch');
  const alias = join(root, 'projects', 'outside-link.kicad_sch');
  writeFileSync(outside, '(kicad_sch)', 'utf8');
  let linked = false;
  try {
    try {
      symlinkSync(outside, alias, 'file');
      linked = true;
    } catch {
      // Windows 未授予创建符号链接权限时，仍验证常规沙箱边界。
    }
    assert.deepEqual(discoverKiCadProjects('projects', root), [
      join('projects', 'board', 'demo.kicad_pro'),
      join('projects', 'board', 'demo.kicad_sch'),
    ]);
    assert.throws(() => discoverKiCadProjects('..', root), /越界/);
    if (linked) {
      assert.equal(discoverKiCadProjects('projects', root).some((path) => path.includes('outside-link')), false);
      assert.throws(() => inspectKiCadProject({ projectPath: alias, workspaceRoot: root }), /越界/);
    }
    assert.equal(basename(projectPath), 'demo.kicad_pro');
    assert.equal(basename(schematicPath), 'demo.kicad_sch');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kicad: 只读盘点工程配置、原理图和 PCB，不修改源文件', () => {
  const { root, projectRoot, projectPath, schematicPath, boardPath } = fixture();
  const before = readFileSync(schematicPath);
  try {
    const result = inspectKiCadProject({
      projectPath,
      workspaceRoot: root,
      executable: process.execPath,
    });
    assert.equal(result.projectRoot, projectRoot);
    assert.equal(result.projectPath, projectPath);
    assert.equal(result.projectFile, projectPath);
    assert.deepEqual(result.schematicFiles, [schematicPath]);
    assert.deepEqual(result.boardFiles, [boardPath]);
    assert.equal(result.schematicCount, 1);
    assert.equal(result.boardCount, 1);
    assert.equal(result.symbolCount, 2);
    assert.equal(result.labelCount, 2);
    assert.equal(result.hierarchicalSheetCount, 1);
    assert.deepEqual(result.configurationDiagnostics, []);
    assert.equal(result.cliAvailable, true);
    assert.deepEqual(readFileSync(schematicPath), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kicad: ERC 使用固定只读参数，解析临时报告并清理', async () => {
  const { root, schematicPath } = fixture();
  const before = readFileSync(schematicPath);
  let seenExecutable = '';
  let seenArgs: string[] = [];
  let seenCwd = '';
  let reportPath = '';
  try {
    const result = await runKiCadErc({
      schematicPath,
      executable: process.execPath,
      workspaceRoot: root,
      runner: async (executable, args, options) => {
        seenExecutable = executable;
        seenArgs = [...args];
        seenCwd = options.cwd;
        const outputIndex = args.indexOf('--output');
        reportPath = args[outputIndex + 1] ?? '';
        writeFileSync(reportPath, JSON.stringify({
          violations: [{ severity: 'error', rule: 'lib_symbol', message: 'demo violation' }],
        }), 'utf8');
        return { stdout: 'ERC report', stderr: '', exitCode: 1, durationMs: 4, timedOut: false };
      },
    });
    assert.equal(seenExecutable, process.execPath);
    assert.deepEqual(seenArgs.slice(0, 3), ['sch', 'erc', '--output']);
    assert.ok(seenArgs.includes('--format'));
    assert.equal(seenArgs[seenArgs.indexOf('--format') + 1], 'json');
    assert.ok(seenArgs.includes('--severity-all'));
    assert.ok(seenArgs.includes('--exit-code-violations'));
    assert.ok(seenArgs.includes(schematicPath));
    assert.equal(seenArgs.includes('--shell'), false);
    assert.equal(seenArgs.includes('shell'), false);
    assert.equal(seenCwd, dirname(schematicPath));
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 1);
    assert.equal(result.reportGenerated, true);
    assert.equal(result.reportRetained, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.errorCount, 1);
    assert.equal(result.warningCount, 0);
    assert.equal(result.exclusionCount, 0);
    assert.equal(result.sourceUnchanged, true);
    assert.equal(existsSync(reportPath), false, 'ERC 报告必须在返回后清理');
    assert.deepEqual(readFileSync(schematicPath), before);
    assert.deepEqual(
      readdirSync(dirname(schematicPath)).filter((name) => /\.(json|raw|log|net)$/i.test(name)),
      [],
      '不得在工程目录生成报告或仿真产物',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kicad: 未验证 kicad-cli 时诚实失败，不把工具探测当 ERC 成功', async () => {
  const { root, schematicPath } = fixture();
  try {
    await assert.rejects(
      runKiCadErc({
        schematicPath,
        executable: join(root, 'missing', 'kicad-cli.exe'),
        workspaceRoot: root,
      }),
      /KiCad CLI 不可用/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
