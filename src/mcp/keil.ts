import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { PARAMS } from '../config/params.js';
import { isPathAllowed } from '../security/sandbox.js';
import { deriveProjectId } from './project-profile-store.js';
import type { ProjectMcpProfile } from './project-profile.js';

export interface KeilDiagnostic {
  severity: 'warning' | 'error';
  message: string;
  code?: string;
  file?: string;
  line?: number;
  sourcePath?: string;
}

export interface KeilCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
}

export interface KeilBuildResult extends KeilCommandResult {
  ok: boolean;
  projectPath: string;
  target?: string;
  warningCount: number;
  errorCount: number;
  diagnostics: KeilDiagnostic[];
  log: string;
}

export type KeilRunner = (
  executable: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; signal?: AbortSignal },
) => Promise<KeilCommandResult>;

export function discoverKeilProjects(rootPath: string, workspaceRoot = process.cwd()): string[] {
  const check = isPathAllowed(rootPath, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '工程目录不在沙箱内');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isDirectory()) {
    throw new Error('工程目录不存在');
  }

  const projects: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === '.uvprojx') projects.push(path);
    }
  };
  walk(check.resolved);
  return projects.sort((a, b) => a.localeCompare(b));
}

export function listKeilTargets(projectPath: string, workspaceRoot = process.cwd()): string[] {
  const resolvedProject = resolveKeilProject(projectPath, workspaceRoot);
  const xml = readFileSync(resolvedProject, 'utf-8');
  const targets: string[] = [];
  for (const match of xml.matchAll(/<TargetName>\s*([\s\S]*?)\s*<\/TargetName>/gi)) {
    const name = decodeXmlText(match[1] ?? '').trim();
    if (name && !targets.includes(name)) targets.push(name);
  }
  return targets;
}

export function inspectKeilProjectProfile(input: {
  projectPath: string;
  workspaceRoot?: string;
  executable?: string;
  now?: number;
}): ProjectMcpProfile {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const resolvedProject = resolveKeilProject(input.projectPath, workspaceRoot);
  const projectRoot = dirname(resolvedProject);
  const projectRef = relative(workspaceRoot, resolvedProject);
  const xml = readFileSync(resolvedProject, 'utf-8');
  const targets = listKeilTargets(resolvedProject, workspaceRoot);
  const selectedTarget = targets.length === 1 ? targets[0]! : null;
  const devices = uniqueXmlValues(xml, 'Device');
  const chip = devices.length === 1 ? devices[0]! : null;
  const now = input.now ?? Date.now();
  const executable = input.executable ? resolve(input.executable) : null;
  const buildAvailable = executable !== null && existsSync(executable) && statSync(executable).isFile();
  const provenance: ProjectMcpProfile['provenance'] = {
    projectRoot: { source: 'project_file', evidenceRef: projectRef, observedAt: now },
    targets: { source: 'project_file', evidenceRef: `${projectRef}#TargetName`, observedAt: now },
  };
  if (selectedTarget) {
    provenance.selectedTarget = {
      source: 'project_file',
      evidenceRef: `${projectRef}#TargetName`,
      observedAt: now,
    };
  }
  if (chip) {
    provenance.chip = { source: 'project_file', evidenceRef: `${projectRef}#Device`, observedAt: now };
  }
  if (buildAvailable) {
    provenance.platform = { source: 'tool_probe', evidenceRef: executable, observedAt: now };
    provenance.build = { source: 'tool_probe', evidenceRef: executable, observedAt: now };
  }
  return {
    schemaVersion: 1,
    projectId: deriveProjectId(projectRoot),
    projectRoot,
    platform: buildAvailable ? 'keil-mdk' : null,
    chip,
    targets,
    selectedTarget,
    capabilities: [{
      agentId: 'keil',
      platform: 'keil-mdk',
      build: buildAvailable ? {
        agentId: 'keil', toolName: 'keil.BuildProject',
        args: { projectPath: resolvedProject, ...(selectedTarget ? { target: selectedTarget } : {}) },
      } : null,
      evidence: buildAvailable
        ? { source: 'tool_probe', evidenceRef: executable, observedAt: now }
        : { source: 'project_file', evidenceRef: projectRef, observedAt: now },
    }],
    build: buildAvailable
      ? {
          agentId: 'keil',
          toolName: 'keil.BuildProject',
          args: {
            projectPath: resolvedProject,
            ...(selectedTarget ? { target: selectedTarget } : {}),
          },
        }
      : null,
    flash: null,
    serial: null,
    sdkRoot: null,
    template: null,
    provenance,
    verifiedAt: now,
  };
}

export async function buildKeilProject(input: {
  projectPath: string;
  target?: string;
  executable: string;
  workspaceRoot?: string;
  runner?: KeilRunner;
  signal?: AbortSignal;
}): Promise<KeilBuildResult> {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const resolvedProject = resolveKeilProject(input.projectPath, workspaceRoot);

  const executable = resolve(input.executable);
  if (!existsSync(executable) || !statSync(executable).isFile()) throw new Error('Keil UV4 可执行文件不存在');
  if (input.target !== undefined && input.target.trim() === '') throw new Error('target 不能为空');

  const logDir = mkdtempSync(join(tmpdir(), 'ai-butler-keil-'));
  const logPath = join(logDir, 'build.log');
  const args = ['-b', resolvedProject];
  if (input.target) args.push('-t', input.target);
  args.push('-o', logPath);

  try {
    const run = await (input.runner ?? runKeilCommand)(executable, args, {
      cwd: dirname(resolvedProject),
      timeoutMs: PARAMS.compileTimeoutMs,
      signal: input.signal,
    });
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
    const combined = [log, run.stdout, run.stderr].filter(Boolean).join('\n');
    const diagnostics = parseKeilDiagnostics(combined).map((item) => ({
      ...item,
      ...resolveDiagnosticSource(item.file, dirname(resolvedProject), workspaceRoot),
    }));
    const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
    const warningCount = diagnostics.filter((item) => item.severity === 'warning').length;
    return {
      ...run,
      ok: run.exitCode === 0 && !run.timedOut && !run.cancelled && errorCount === 0,
      projectPath: resolvedProject,
      ...(input.target ? { target: input.target } : {}),
      warningCount,
      errorCount,
      diagnostics,
      log: combined,
    };
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
}

export function parseKeilDiagnostics(output: string): KeilDiagnostic[] {
  const diagnostics: KeilDiagnostic[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const source = line.match(/^(.+?)\((\d+)\):\s*(warning|error):\s*(?:(#?[A-Z0-9-]+):\s*)?(.*)$/i);
    if (source) {
      diagnostics.push({
        severity: source[3]!.toLowerCase() as 'warning' | 'error',
        file: source[1]!,
        line: Number(source[2]),
        ...(source[4] ? { code: source[4] } : {}),
        message: source[5]!,
      });
      continue;
    }
    const linker = line.match(/^(.*?):\s*(warning|error):\s*([A-Z]\d+[A-Z]?):\s*(.*)$/i);
    if (linker) {
      diagnostics.push({
        severity: linker[2]!.toLowerCase() as 'warning' | 'error',
        file: linker[1]!,
        code: linker[3]!,
        message: linker[4]!,
      });
    }
  }
  return diagnostics;
}

export async function runKeilCommand(
  executable: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; signal?: AbortSignal },
): Promise<KeilCommandResult> {
  const started = Date.now();
  if (opts.signal?.aborted) {
    return { stdout: '', stderr: 'Keil 编译已取消', exitCode: 130, durationMs: 0, timedOut: false, cancelled: true };
  }
  return await new Promise((resolveRun) => {
    const child = spawn(executable, args, {
      cwd: opts.cwd,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolveRun({ stdout, stderr, exitCode, durationMs: Date.now() - started, timedOut, ...(cancelled ? { cancelled: true } : {}) });
    };
    const terminate = () => {
      if (child.pid && process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
          timeout: 5_000,
        });
        child.kill('SIGKILL');
      } else {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGTERM');
          else child.kill('SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
      }
    };
    const onAbort = () => {
      if (settled) return;
      cancelled = true;
      clearTimeout(timer);
      stderr += `${stderr ? '\n' : ''}Keil 编译已取消`;
      terminate();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stderr += `${stderr ? '\n' : ''}Keil 编译超过 [P-38]，已终止进程树`;
      terminate();
    }, opts.timeoutMs);
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
    child.on('error', (err) => {
      stderr += `${stderr ? '\n' : ''}${err.message}`;
      finish(127);
    });
    child.on('close', (code) => finish(cancelled ? 130 : timedOut ? 124 : (code ?? 1)));
  });
}

export function relativeKeilProjects(paths: string[], workspaceRoot = process.cwd()): string[] {
  return paths.map((path) => relative(workspaceRoot, path));
}

function resolveKeilProject(projectPath: string, workspaceRoot: string): string {
  const check = isPathAllowed(projectPath, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '工程路径不在沙箱内');
  if (extname(check.resolved).toLowerCase() !== '.uvprojx') throw new Error('只允许读取 .uvprojx 工程');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isFile()) throw new Error('Keil 工程不存在');
  return check.resolved;
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function uniqueXmlValues(xml: string, tag: string): string[] {
  const values: string[] = [];
  const expression = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'gi');
  for (const match of xml.matchAll(expression)) {
    const value = decodeXmlText(match[1] ?? '').trim();
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function resolveDiagnosticSource(
  file: string | undefined,
  projectDir: string,
  workspaceRoot: string,
): { sourcePath?: string } {
  if (!file) return {};
  const candidate = resolve(projectDir, file.replace(/^['"]|['"]$/g, ''));
  const check = isPathAllowed(candidate, workspaceRoot);
  if (!check.allowed || !check.resolved || !existsSync(check.resolved) || !statSync(check.resolved).isFile()) return {};
  return { sourcePath: relative(workspaceRoot, check.resolved) };
}
