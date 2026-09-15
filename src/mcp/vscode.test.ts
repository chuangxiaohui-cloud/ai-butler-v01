import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { discoverVsCodeWorkspaces, inspectVsCodeWorkspace } from './vscode.js';

function fixture(): { root: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'vscode-mcp-'));
  const project = join(root, 'projects', 'demo');
  mkdirSync(join(project, '.vscode'), { recursive: true });
  return { root, project };
}

test('vscode: 发现含配置目录或 code-workspace 文件的工作区', () => {
  const { root, project } = fixture();
  const second = join(root, 'projects', 'second');
  mkdirSync(second, { recursive: true });
  writeFileSync(join(second, 'demo.code-workspace'), '{}', 'utf-8');
  try {
    assert.deepEqual(discoverVsCodeWorkspaces(join(root, 'projects'), root), [
      join('projects', 'demo'),
      join('projects', 'second'),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  void project;
});

test('vscode: JSONC 只读盘点任务、C++ 配置和诊断来源且不回显命令', () => {
  const { root, project } = fixture();
  writeFileSync(join(project, '.vscode', 'tasks.json'), `{
    // 任务命令不得进入摘要
    "version": "2.0.0",
    "tasks": [{
      "label": "Build firmware",
      "type": "shell",
      "command": "secret-build --token hidden",
      "group": { "kind": "build" },
      "problemMatcher": ["$gcc"],
    }],
  }`, 'utf-8');
  writeFileSync(join(project, '.vscode', 'c_cpp_properties.json'), JSON.stringify({
    configurations: [{
      name: 'ARM GCC',
      compilerPath: 'C:/gcc/bin/arm-none-eabi-gcc.exe',
      intelliSenseMode: 'windows-gcc-arm',
      compileCommands: '${workspaceFolder}/build/compile_commands.json',
    }],
  }), 'utf-8');
  writeFileSync(join(project, '.vscode', 'settings.json'), JSON.stringify({
    'cmake.generator': 'Ninja',
    'unrelated.secret': 'do-not-return',
  }), 'utf-8');
  try {
    const result = inspectVsCodeWorkspace({ root: project, workspaceRoot: root, now: 123 });
    assert.equal(result.tasks[0]?.label, 'Build firmware');
    assert.equal(result.tasks[0]?.hasCommand, true);
    assert.deepEqual(result.diagnosticMatchers, ['$gcc']);
    assert.equal(result.cppConfigurations[0]?.compilerPath, 'C:/gcc/bin/arm-none-eabi-gcc.exe');
    assert.equal(result.buildSettings['cmake.generator'], 'Ninja');
    assert.equal(result.liveDiagnosticsAvailable, false);
    assert.equal(JSON.stringify(result).includes('secret-build'), false);
    assert.equal(JSON.stringify(result).includes('do-not-return'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('vscode: 单个损坏配置形成诊断但不阻断其他文件', () => {
  const { root, project } = fixture();
  writeFileSync(join(project, '.vscode', 'tasks.json'), JSON.stringify({ tasks: [{ label: 'ok' }] }), 'utf-8');
  writeFileSync(join(project, '.vscode', 'launch.json'), '{bad', 'utf-8');
  try {
    const result = inspectVsCodeWorkspace({ root: project, workspaceRoot: root });
    assert.equal(result.tasks[0]?.label, 'ok');
    assert.equal(result.configurationDiagnostics.length, 1);
    assert.match(result.configurationDiagnostics[0]?.path ?? '', /launch\.json$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('vscode: 拒绝沙箱越界和不存在目录', () => {
  const { root } = fixture();
  try {
    assert.throws(() => inspectVsCodeWorkspace({ root: '..', workspaceRoot: root }), /越界/);
    assert.throws(() => inspectVsCodeWorkspace({ root: join(root, 'projects', 'missing'), workspaceRoot: root }), /不存在/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
