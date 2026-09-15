import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { buildKeilProject, discoverKeilProjects, inspectKeilProjectProfile, listKeilTargets, parseKeilDiagnostics, runKeilCommand } from './keil.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'keil-agent-'));
  const project = join(root, 'projects', 'firmware', 'demo.uvprojx');
  mkdirSync(dirname(project), { recursive: true });
  writeFileSync(project, '<Project/>', 'utf-8');
  return { root, project };
}

test('keil: 只发现沙箱目录内 uvprojx 并拒绝越界', () => {
  const { root, project } = fixture();
  try {
    writeFileSync(join(dirname(project), 'readme.txt'), 'x', 'utf-8');
    assert.deepEqual(discoverKeilProjects('projects', root), [project]);
    assert.throws(() => discoverKeilProjects('..', root), /越界/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: 编译命令固定为 build，解析 warning/error 且不含 flash', async () => {
  const { root, project } = fixture();
  try {
    let seenArgs: string[] = [];
    const result = await buildKeilProject({
      projectPath: project,
      target: 'Debug',
      executable: process.execPath,
      workspaceRoot: root,
      runner: async (_executable, args) => {
        seenArgs = args;
        const logPath = args[args.indexOf('-o') + 1]!;
        writeFileSync(logPath, [
          'main.c(42): warning: #177-D: variable was never referenced',
          '.\\Objects\\demo.axf: Error: L6218E: Undefined symbol foo',
        ].join('\n'), 'utf-8');
        return { stdout: '', stderr: '', exitCode: 1, durationMs: 12, timedOut: false };
      },
    });
    assert.deepEqual(seenArgs.slice(0, 4), ['-b', project, '-t', 'Debug']);
    assert.equal(seenArgs.includes('-f'), false);
    assert.equal(result.ok, false);
    assert.equal(result.warningCount, 1);
    assert.equal(result.errorCount, 1);
    assert.equal(result.diagnostics[0]?.line, 42);
    assert.equal(result.diagnostics[1]?.code, 'L6218E');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: 成功与超时状态由退出码、诊断和 timedOut 共同决定', async () => {
  const { root, project } = fixture();
  try {
    const success = await buildKeilProject({
      projectPath: project,
      executable: process.execPath,
      workspaceRoot: root,
      runner: async () => ({ stdout: '0 Error(s), 0 Warning(s).', stderr: '', exitCode: 0, durationMs: 5, timedOut: false }),
    });
    assert.equal(success.ok, true);
    const timeout = await buildKeilProject({
      projectPath: project,
      executable: process.execPath,
      workspaceRoot: root,
      runner: async () => ({ stdout: '', stderr: '', exitCode: 124, durationMs: 5, timedOut: true }),
    });
    assert.equal(timeout.ok, false);
    assert.equal(timeout.timedOut, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: 诊断解析支持编译器与链接器格式', () => {
  const diagnostics = parseKeilDiagnostics([
    'src\\app.c(7): error: #20: identifier x is undefined',
    '.\\Objects\\app.axf: Warning: L6314W: No section matches pattern',
  ].join('\n'));
  assert.equal(diagnostics.length, 2);
  assert.deepEqual(diagnostics.map((item) => item.severity), ['error', 'warning']);
  assert.equal(diagnostics[0]?.code, '#20');
  assert.equal(diagnostics[1]?.code, 'L6314W');
});

test('keil: 只读解析 target，保序去重并解码 XML 实体', () => {
  const { root, project } = fixture();
  try {
    writeFileSync(project, [
      '<Project><Targets>',
      '<Target><TargetName>Debug &amp; Trace</TargetName></Target>',
      '<Target><TargetName>Release</TargetName></Target>',
      '<Target><TargetName>Debug &amp; Trace</TargetName></Target>',
      '</Targets></Project>',
    ].join(''), 'utf-8');
    assert.deepEqual(listKeilTargets(project, root), ['Debug & Trace', 'Release']);
    writeFileSync(project, '<Project><Targets>', 'utf-8');
    assert.deepEqual(listKeilTargets(project, root), []);
    assert.throws(() => listKeilTargets('..\\outside.uvprojx', root), /越界/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: 只读盘点生成 target/device 画像且未知硬件字段保持 null', () => {
  const { root, project } = fixture();
  try {
    writeFileSync(project, [
      '<Project><Targets>',
      '<Target><TargetName>Debug</TargetName><TargetOption><TargetCommonOption><Device>STM32F103C8</Device></TargetCommonOption></TargetOption></Target>',
      '</Targets></Project>',
    ].join(''), 'utf-8');
    const profile = inspectKeilProjectProfile({
      projectPath: project,
      workspaceRoot: root,
      executable: process.execPath,
      now: 123,
    });
    assert.equal(profile.platform, 'keil-mdk');
    assert.equal(profile.chip, 'STM32F103C8');
    assert.deepEqual(profile.targets, ['Debug']);
    assert.equal(profile.selectedTarget, 'Debug');
    assert.deepEqual(profile.build?.args, { projectPath: project, target: 'Debug' });
    assert.equal(profile.flash, null);
    assert.equal(profile.serial, null);
    assert.equal(profile.sdkRoot, null);
    assert.equal(profile.provenance.chip?.source, 'project_file');
    assert.equal(profile.provenance.build?.source, 'tool_probe');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: 多 target 或未配置 UV4 时不猜 selectedTarget 与 build', () => {
  const { root, project } = fixture();
  try {
    writeFileSync(project, '<Project><Targets><Target><TargetName>A</TargetName></Target><Target><TargetName>B</TargetName></Target></Targets></Project>', 'utf-8');
    const profile = inspectKeilProjectProfile({ projectPath: project, workspaceRoot: root, now: 1 });
    assert.deepEqual(profile.targets, ['A', 'B']);
    assert.equal(profile.selectedTarget, null);
    assert.equal(profile.build, null);
    assert.equal(profile.platform, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: 编译诊断仅为工作区内现存源码补 sourcePath', async () => {
  const { root, project } = fixture();
  const source = join(dirname(project), 'src', 'main.c');
  mkdirSync(dirname(source), { recursive: true });
  writeFileSync(source, 'int main(void) { return 0; }', 'utf-8');
  try {
    const result = await buildKeilProject({
      projectPath: project,
      executable: process.execPath,
      workspaceRoot: root,
      runner: async (_executable, args) => {
        const logPath = args[args.indexOf('-o') + 1]!;
        writeFileSync(logPath, [
          'src\\main.c(1): warning: #1: demo',
          '..\\outside.c(2): error: #2: outside',
        ].join('\n'), 'utf-8');
        return { stdout: '', stderr: '', exitCode: 1, durationMs: 1, timedOut: false };
      },
    });
    assert.equal(result.diagnostics[0]?.sourcePath, join('projects', 'firmware', 'src', 'main.c'));
    assert.equal(result.diagnostics[1]?.sourcePath, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: 运行中取消终止编译进程树', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keil-tree-'));
  const childScript = join(root, 'child.cjs');
  const parentScript = join(root, 'parent.cjs');
  const pidPath = join(root, 'child.pid');
  writeFileSync(childScript, 'setInterval(()=>{},1000);', 'utf-8');
  writeFileSync(parentScript, [
    "const {spawn}=require('node:child_process');",
    "const fs=require('node:fs');",
    'const child=spawn(process.execPath,[process.argv[2]],{stdio:\'ignore\'});',
    'fs.writeFileSync(process.argv[3],String(child.pid));',
    'setInterval(()=>{},1000);',
  ].join('\n'), 'utf-8');
  const controller = new AbortController();
  let childPid = 0;
  try {
    const pending = runKeilCommand(process.execPath, [parentScript, childScript, pidPath], {
      cwd: root,
      timeoutMs: 5000,
      signal: controller.signal,
    });
    for (let i = 0; i < 100 && !existsSync(pidPath); i++) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    childPid = Number(readFileSync(pidPath, 'utf-8'));
    controller.abort();
    const result = await pending;
    assert.equal(result.cancelled, true);
    assert.equal(result.exitCode, 130);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    assert.equal(processAlive(childPid), false, '子进程应随 UV4 父进程一起终止');
  } finally {
    if (childPid && processAlive(childPid)) {
      try { process.kill(childPid, 'SIGKILL'); } catch { /* 已退出 */ }
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('keil: [P-38] 超时走进程终止并返回 timedOut', async () => {
  const root = mkdtempSync(join(tmpdir(), 'keil-timeout-'));
  const script = join(root, 'slow.cjs');
  writeFileSync(script, 'setInterval(()=>{},1000);', 'utf-8');
  try {
    const result = await runKeilCommand(process.execPath, [script], { cwd: root, timeoutMs: 50 });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
    assert.match(result.stderr, /P-38/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
