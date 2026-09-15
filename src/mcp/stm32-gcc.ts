/** E406：STM32-GCC/CMake 第二平台；仅盘点与 build，不含 flash。 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

import { PARAMS } from '../config/params.js';
import { isPathAllowed } from '../security/sandbox.js';
import { deriveProjectId } from './project-profile-store.js';
import type { ProjectMcpProfile } from './project-profile.js';

export interface Stm32GccDiagnostic {
  severity: 'warning' | 'error';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  sourcePath?: string;
}

export interface Stm32GccCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
}

export type Stm32GccRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal },
) => Promise<Stm32GccCommandResult>;

export function discoverStm32GccProjects(rootPath: string, workspaceRoot = process.cwd()): string[] {
  const root = resolveDirectory(rootPath, workspaceRoot);
  const projects: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!['.git', 'node_modules', 'data', 'dist'].includes(entry.name)) walk(path);
      } else if (entry.isFile() && entry.name === 'CMakeLists.txt') {
        const text = readFileSync(path, 'utf-8');
        if (/STM32|arm-none-eabi|CMAKE_TOOLCHAIN_FILE/i.test(text) || findCompileCommands(dir)) {
          projects.push(dir);
        }
      }
    }
  };
  walk(root);
  return projects.sort((a, b) => a.localeCompare(b));
}

export function inspectStm32GccProject(input: {
  root: string;
  workspaceRoot?: string;
  cmakeExecutable?: string;
  now?: number;
}): ProjectMcpProfile {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const root = resolveDirectory(input.root, workspaceRoot);
  const cmakeLists = join(root, 'CMakeLists.txt');
  if (!existsSync(cmakeLists) || !statSync(cmakeLists).isFile()) throw new Error('CMakeLists.txt 不存在');
  const cmakeText = readFileSync(cmakeLists, 'utf-8');
  const compileCommandsPath = findCompileCommands(root);
  const compileEntries = compileCommandsPath ? readCompileCommands(compileCommandsPath) : [];
  const compileText = compileEntries.map((entry) => [entry.command, ...(entry.arguments ?? [])].filter(Boolean).join(' ')).join('\n');
  const hasArmGccEvidence = /arm-none-eabi-(?:gcc|g\+\+)/i.test(`${cmakeText}\n${compileText}`);
  const chipCandidates = uniqueMatches(`${cmakeText}\n${compileText}`, /\b(STM32[A-Z0-9]+x[A-Z0-9]+|STM32[A-Z0-9]{5,})\b/gi);
  const targets = uniqueMatches(cmakeText, /\b(?:add_executable|add_library)\s*\(\s*([A-Za-z0-9_.+-]+)/gi);
  const selectedTarget = targets.length === 1 ? targets[0]! : null;
  const buildDir = compileCommandsPath ? dirname(compileCommandsPath) : findPresetBuildDir(root);
  const cmakeExecutable = input.cmakeExecutable ? resolve(input.cmakeExecutable) : null;
  const cmakeAvailable = cmakeExecutable !== null && existsSync(cmakeExecutable) && statSync(cmakeExecutable).isFile();
  const now = input.now ?? Date.now();
  const projectRef = relative(workspaceRoot, cmakeLists);
  const provenance: ProjectMcpProfile['provenance'] = {
    projectRoot: { source: 'project_file', evidenceRef: projectRef, observedAt: now },
    targets: { source: 'project_file', evidenceRef: `${projectRef}#cmake-targets`, observedAt: now },
  };
  if (hasArmGccEvidence) provenance.platform = { source: 'project_file', evidenceRef: compileCommandsPath ? relative(workspaceRoot, compileCommandsPath) : projectRef, observedAt: now };
  if (chipCandidates.length === 1) provenance.chip = { source: 'project_file', evidenceRef: compileCommandsPath ? relative(workspaceRoot, compileCommandsPath) : projectRef, observedAt: now };
  if (selectedTarget) provenance.selectedTarget = { source: 'project_file', evidenceRef: `${projectRef}#cmake-targets`, observedAt: now };
  if (cmakeAvailable && buildDir && hasArmGccEvidence) provenance.build = { source: 'tool_probe', evidenceRef: cmakeExecutable, observedAt: now };

  return {
    schemaVersion: 1,
    projectId: deriveProjectId(root),
    projectRoot: root,
    platform: hasArmGccEvidence ? 'stm32-gcc-cmake' : null,
    chip: chipCandidates.length === 1 ? chipCandidates[0]! : null,
    targets,
    selectedTarget,
    capabilities: [{
      agentId: 'stm32-gcc',
      platform: 'stm32-gcc-cmake',
      build: cmakeAvailable && buildDir && hasArmGccEvidence ? {
        agentId: 'stm32-gcc', toolName: 'stm32-gcc.BuildProject',
        args: { root, buildDir, ...(selectedTarget ? { target: selectedTarget } : {}) },
      } : null,
      evidence: cmakeAvailable && buildDir && hasArmGccEvidence
        ? { source: 'tool_probe', evidenceRef: cmakeExecutable, observedAt: now }
        : { source: 'project_file', evidenceRef: projectRef, observedAt: now },
    }],
    build: cmakeAvailable && buildDir && hasArmGccEvidence ? {
      agentId: 'stm32-gcc',
      toolName: 'stm32-gcc.BuildProject',
      args: { root, buildDir, ...(selectedTarget ? { target: selectedTarget } : {}) },
    } : null,
    flash: null,
    serial: null,
    sdkRoot: null,
    template: null,
    provenance,
    verifiedAt: now,
  };
}

export async function buildStm32GccProject(input: {
  root: string;
  buildDir: string;
  target?: string;
  cmakeExecutable: string;
  workspaceRoot?: string;
  runner?: Stm32GccRunner;
  signal?: AbortSignal;
}) {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const root = resolveDirectory(input.root, workspaceRoot);
  const buildDir = resolveDirectory(input.buildDir, workspaceRoot);
  if (!isInside(buildDir, root)) throw new Error('buildDir 必须位于项目根内');
  const executable = resolve(input.cmakeExecutable);
  if (!existsSync(executable) || !statSync(executable).isFile()) throw new Error('CMake 可执行文件不存在');
  if (input.target !== undefined && !input.target.trim()) throw new Error('target 不能为空');
  const args = ['--build', buildDir, ...(input.target ? ['--target', input.target] : [])];
  const run = await (input.runner ?? runCmakeCommand)(executable, args, {
    cwd: root,
    timeoutMs: PARAMS.compileTimeoutMs,
    signal: input.signal,
  });
  const output = [run.stdout, run.stderr].filter(Boolean).join('\n');
  const diagnostics = parseStm32GccDiagnostics(output, root, workspaceRoot);
  return {
    ...run,
    ok: run.exitCode === 0 && !run.timedOut && !run.cancelled && !diagnostics.some((item) => item.severity === 'error'),
    projectRoot: root,
    buildDir,
    ...(input.target ? { target: input.target } : {}),
    warningCount: diagnostics.filter((item) => item.severity === 'warning').length,
    errorCount: diagnostics.filter((item) => item.severity === 'error').length,
    diagnostics,
  };
}

export function parseStm32GccDiagnostics(output: string, projectRoot: string, workspaceRoot: string): Stm32GccDiagnostic[] {
  const diagnostics: Stm32GccDiagnostic[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const match = raw.trim().match(/^(.+?):(\d+)(?::(\d+))?:\s*(warning|error):\s*(.*)$/i);
    if (!match) continue;
    const file = match[1]!;
    const candidate = resolve(projectRoot, file);
    const check = isPathAllowed(candidate, workspaceRoot);
    diagnostics.push({
      severity: match[4]!.toLowerCase() as 'warning' | 'error',
      file,
      line: Number(match[2]),
      ...(match[3] ? { column: Number(match[3]) } : {}),
      message: match[5]!,
      ...(check.allowed && check.resolved && existsSync(check.resolved) ? { sourcePath: relative(workspaceRoot, check.resolved) } : {}),
    });
  }
  return diagnostics;
}

async function runCmakeCommand(executable: string, args: string[], options: { cwd: string; timeoutMs: number; signal?: AbortSignal }): Promise<Stm32GccCommandResult> {
  const started = Date.now();
  if (options.signal?.aborted) return { stdout: '', stderr: 'CMake build 已取消', exitCode: 130, durationMs: 0, timedOut: false, cancelled: true };
  return await new Promise((resolveRun) => {
    const child = spawn(executable, args, { cwd: options.cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      resolveRun({ stdout, stderr, exitCode, durationMs: Date.now() - started, timedOut, ...(cancelled ? { cancelled: true } : {}) });
    };
    const stop = () => {
      if (child.pid && process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
          timeout: 5_000,
        });
      }
      child.kill('SIGKILL');
    };
    const cancel = () => { cancelled = true; stderr += `${stderr ? '\n' : ''}CMake build 已取消`; stop(); };
    const timer = setTimeout(() => { timedOut = true; stderr += `${stderr ? '\n' : ''}CMake build 超过 [P-38]`; stop(); }, options.timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
    child.on('error', (error) => { stderr += `${stderr ? '\n' : ''}${error.message}`; finish(127); });
    child.on('close', (code) => finish(cancelled ? 130 : timedOut ? 124 : (code ?? 1)));
  });
}

function findCompileCommands(root: string): string | null {
  for (const path of [join(root, 'build', 'compile_commands.json'), join(root, 'compile_commands.json')]) {
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

function readCompileCommands(path: string): Array<{ command?: string; arguments?: string[] }> {
  try {
    const value = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(value) ? value.filter((item) => typeof item === 'object' && item !== null) : [];
  } catch {
    return [];
  }
}

function findPresetBuildDir(root: string): string | null {
  const path = join(root, 'CMakePresets.json');
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf-8')) as { configurePresets?: Array<{ binaryDir?: unknown }> };
    const dirs = (value.configurePresets ?? []).map((item) => item.binaryDir).filter((item): item is string => typeof item === 'string');
    if (dirs.length !== 1 || dirs[0]!.includes('${')) return null;
    const dir = resolve(root, dirs[0]!);
    return isInside(dir, root) && existsSync(dir) && statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

function uniqueMatches(text: string, expression: RegExp): string[] {
  return [...new Set([...text.matchAll(expression)].map((match) => match[1]!).filter(Boolean))];
}

function resolveDirectory(path: string, workspaceRoot: string): string {
  const check = isPathAllowed(path, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '路径不在沙箱内');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isDirectory()) throw new Error('目录不存在');
  return check.resolved;
}

function isInside(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}
