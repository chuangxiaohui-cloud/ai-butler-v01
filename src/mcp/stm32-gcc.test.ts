import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { buildStm32GccProject, discoverStm32GccProjects, inspectStm32GccProject, parseStm32GccDiagnostics } from './stm32-gcc.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'stm32-gcc-'));
  const project = join(root, 'projects', 'demo');
  const buildDir = join(project, 'build');
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(project, 'CMakeLists.txt'), 'project(demo C)\nadd_executable(firmware main.c)\n# arm-none-eabi-gcc STM32F103xB', 'utf-8');
  writeFileSync(join(project, 'main.c'), 'int main(void){return 0;}', 'utf-8');
  writeFileSync(join(buildDir, 'compile_commands.json'), JSON.stringify([{ directory: buildDir, command: 'arm-none-eabi-gcc -DSTM32F103xB main.c', file: 'main.c' }]), 'utf-8');
  return { root, project, buildDir };
}

test('stm32-gcc: 发现有 ARM GCC 证据的 CMake 工程', () => {
  const { root, project } = fixture();
  try { assert.deepEqual(discoverStm32GccProjects(join(root, 'projects'), root), [project]); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('stm32-gcc: 画像取证芯片/target/buildDir 且 flash/serial 为 null', () => {
  const { root, project, buildDir } = fixture();
  try {
    const profile = inspectStm32GccProject({ root: project, workspaceRoot: root, cmakeExecutable: process.execPath, now: 123 });
    assert.equal(profile.platform, 'stm32-gcc-cmake');
    assert.equal(profile.chip, 'STM32F103xB');
    assert.deepEqual(profile.targets, ['firmware']);
    assert.equal(profile.selectedTarget, 'firmware');
    assert.deepEqual(profile.build?.args, { root: project, buildDir, target: 'firmware' });
    assert.equal(profile.flash, null);
    assert.equal(profile.serial, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stm32-gcc: 多芯片证据或缺 CMake 时不猜芯片/build', () => {
  const { root, project } = fixture();
  writeFileSync(join(project, 'CMakeLists.txt'), 'add_executable(a main.c)\n# STM32F103xB STM32F407xG arm-none-eabi-gcc', 'utf-8');
  try {
    const profile = inspectStm32GccProject({ root: project, workspaceRoot: root });
    assert.equal(profile.chip, null);
    assert.equal(profile.build, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stm32-gcc: build 固定 cmake 参数并解析工作区内诊断', async () => {
  const { root, project, buildDir } = fixture();
  try {
    const result = await buildStm32GccProject({
      root: project,
      buildDir,
      target: 'firmware',
      cmakeExecutable: process.execPath,
      workspaceRoot: root,
      runner: async (_executable, args) => {
        assert.deepEqual(args, ['--build', buildDir, '--target', 'firmware']);
        return { stdout: `${join(project, 'main.c')}:1:2: warning: demo`, stderr: '', exitCode: 0, durationMs: 1, timedOut: false };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.warningCount, 1);
    assert.equal(result.diagnostics[0]?.sourcePath, join('projects', 'demo', 'main.c'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stm32-gcc: 拒绝项目根之外 buildDir', async () => {
  const { root, project } = fixture();
  const outside = join(root, 'projects', 'outside-build');
  mkdirSync(outside, { recursive: true });
  try {
    await assert.rejects(buildStm32GccProject({ root: project, buildDir: outside, cmakeExecutable: process.execPath, workspaceRoot: root }), /项目根内/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('stm32-gcc: 诊断不会为越界文件生成 sourcePath', () => {
  const { root, project } = fixture();
  try {
    const diagnostics = parseStm32GccDiagnostics('../outside.c:2: error: bad', project, root);
    assert.equal(diagnostics[0]?.sourcePath, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
