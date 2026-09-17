/** E409/E413：LTspice 原理图只读盘点；仿真须经批准：先 -netlist，再固定 -b 跑 .net。 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

import { PARAMS } from '../config/params.js';
import { isPathAllowed } from '../security/sandbox.js';

export interface LtspiceSimulationRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
}

export type LtspiceSimulationRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal },
) => Promise<LtspiceSimulationRunnerResult>;

export interface LtspiceSchematicInspection {
  schematicPath: string;
  schematicRoot: string;
  encoding: 'utf8' | 'utf16le' | 'utf16be';
  componentCount: number;
  symbolKinds: string[];
  instanceNames: string[];
  simulationDirectives: string[];
  includeDirectives: string[];
  configurationDiagnostics: Array<{ code: string; severity: 'warning'; message: string }>;
  executableAvailable: boolean;
  simulationExecuted: false;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'data']);

export function discoverLtspiceSchematics(rootPath: string, workspaceRoot = process.cwd()): string[] {
  const root = resolveDirectory(rootPath, workspaceRoot);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.asc') {
        found.push(relative(workspaceRoot, path));
      }
    }
  };
  walk(root);
  return found.sort((a, b) => a.localeCompare(b));
}

export function inspectLtspiceSchematic(input: {
  schematicPath: string;
  workspaceRoot?: string;
  executable?: string;
}): LtspiceSchematicInspection {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const schematicPath = resolveSchematic(input.schematicPath, workspaceRoot);
  const decoded = decodeLtspice(readFileSync(schematicPath));
  const lines = decoded.text.split(/\r?\n/);
  const symbolKinds = lines.flatMap((line) => /^SYMBOL\s+(\S+)/i.exec(line)?.[1] ?? []);
  const instanceNames = lines.flatMap((line) => /^SYMATTR\s+InstName\s+(.+)$/i.exec(line)?.[1]?.trim() ?? []);
  const directives = lines.flatMap((line) => {
    const marker = line.indexOf('!');
    if (/^TEXT\s/i.test(line) && marker >= 0) return [line.slice(marker + 1).trim()];
    return /^\s*\./.test(line) ? [line.trim()] : [];
  });
  const simulationDirectives = directives.filter((line) => /^\.(?:tran|ac|dc|op|noise|tf|four|fra)\b/i.test(line));
  const includeDirectives = directives.filter((line) => /^\.(?:include|lib)\b/i.test(line));
  const configurationDiagnostics: LtspiceSchematicInspection['configurationDiagnostics'] = [];
  if (simulationDirectives.length === 0) {
    configurationDiagnostics.push({
      code: 'simulation_command_missing',
      severity: 'warning',
      message: '未发现仿真指令；本工具不会猜测或写入仿真参数。',
    });
  }
  return {
    schematicPath,
    schematicRoot: dirname(schematicPath),
    encoding: decoded.encoding,
    componentCount: symbolKinds.length,
    symbolKinds: [...new Set(symbolKinds)],
    instanceNames,
    simulationDirectives,
    includeDirectives,
    configurationDiagnostics,
    executableAvailable: Boolean(input.executable && existsSync(input.executable) && statSync(input.executable).isFile()),
    simulationExecuted: false,
  };
}

function resolveDirectory(path: string, workspaceRoot: string): string {
  const check = isPathAllowed(path, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '目录不在沙箱内');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isDirectory()) throw new Error('LTspice 盘点目录不存在');
  return check.resolved;
}

function resolveSchematic(path: string, workspaceRoot: string): string {
  const check = isPathAllowed(path, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '文件不在沙箱内');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isFile()) throw new Error('LTspice 原理图不存在');
  if (extname(check.resolved).toLowerCase() !== '.asc') throw new Error('只允许读取 LTspice .asc 原理图');
  return check.resolved;
}

function decodeLtspice(buffer: Buffer): { text: string; encoding: LtspiceSchematicInspection['encoding'] } {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.subarray(2).toString('utf16le'), encoding: 'utf16le' };
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const bytes = Buffer.from(buffer.subarray(2));
    for (let index = 0; index + 1 < bytes.length; index += 2) {
      [bytes[index], bytes[index + 1]] = [bytes[index + 1]!, bytes[index]!];
    }
    return { text: bytes.toString('utf16le'), encoding: 'utf16be' };
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 200));
  let oddZeros = 0;
  for (let index = 1; index < sample.length; index += 2) if (sample[index] === 0) oddZeros++;
  if (sample.length >= 4 && oddZeros >= Math.floor(sample.length / 4)) {
    return { text: buffer.toString('utf16le'), encoding: 'utf16le' };
  }
  return { text: buffer.toString('utf8'), encoding: 'utf8' };
}

export async function runLtspiceSimulation(input: {
  schematicPath: string;
  executable: string;
  workspaceRoot?: string;
  runner?: LtspiceSimulationRunner;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  simulationExecuted: true;
  schematicPath: string;
  batchArgs: string[];
  outputFiles: Array<{ path: string; bytes: number; sha256: string }>;
  stdout: string;
  stderr: string;
}> {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const schematicPath = resolveSchematic(input.schematicPath, workspaceRoot);
  if (!existsSync(input.executable) || !statSync(input.executable).isFile()) {
    throw new Error('LTspice 可执行文件不可用，请先登记真实路径');
  }
  const inspection = inspectLtspiceSchematic({
    schematicPath,
    workspaceRoot,
    executable: input.executable,
  });
  if (inspection.simulationDirectives.length === 0) {
    throw new Error('原理图缺少仿真指令；拒绝猜测参数并启动仿真');
  }
  // LTspice 24 对 .asc 直接 -b 在无交互会话常会挂起；官方文档示例亦为 deck.cir。
  // 先 -netlist 生成同目录 .net，再仅以 -b + .net 跑批仿真（禁止额外开关与 shell）。
  const runner = input.runner ?? defaultSimulationRunner;
  const cwd = dirname(schematicPath);
  const runOptions = {
    cwd,
    timeoutMs: PARAMS.compileTimeoutMs,
    ...(input.signal ? { signal: input.signal } : {}),
  };
  const netPath = join(cwd, `${basename(schematicPath, extname(schematicPath))}.net`);
  const netlistArgs = ['-netlist', schematicPath];
  const before = listSimOutputs(schematicPath, workspaceRoot);
  const netlisted = await runner(input.executable, netlistArgs, runOptions);
  if (netlisted.timedOut || (netlisted.cancelled ?? false)) {
    return {
      ok: false,
      exitCode: netlisted.exitCode,
      durationMs: netlisted.durationMs,
      timedOut: netlisted.timedOut,
      cancelled: netlisted.cancelled ?? false,
      simulationExecuted: true,
      schematicPath,
      batchArgs: netlistArgs,
      outputFiles: [],
      stdout: netlisted.stdout,
      stderr: netlisted.stderr || 'LTspice -netlist 超时或被取消',
    };
  }
  if (!existsSync(netPath) || !statSync(netPath).isFile()) {
    throw new Error('LTspice -netlist 未在原理图同目录生成 .net');
  }
  const batchArgs = ['-b', netPath];
  const result = await runner(input.executable, batchArgs, runOptions);
  const after = listSimOutputs(schematicPath, workspaceRoot);
  const outputFiles = after.filter((item) => {
    const prior = before.find((old) => old.path === item.path);
    return !prior || prior.sha256 !== item.sha256;
  });
  const cancelled = result.cancelled ?? false;
  // GUI 子系统偶发 exitCode=null；有新 .raw 即可视为批仿真落地
  const hasRaw = outputFiles.some((item) => /\.raw$/i.test(item.path));
  const ok =
    !result.timedOut
    && !cancelled
    && (result.exitCode === 0 || (result.exitCode == null && hasRaw));
  return {
    ok,
    exitCode: result.exitCode,
    durationMs: netlisted.durationMs + result.durationMs,
    timedOut: result.timedOut,
    cancelled,
    simulationExecuted: true,
    schematicPath,
    batchArgs,
    outputFiles,
    stdout: [netlisted.stdout, result.stdout].filter(Boolean).join('\n'),
    stderr: [netlisted.stderr, result.stderr].filter(Boolean).join('\n'),
  };
}

function listSimOutputs(
  schematicPath: string,
  workspaceRoot: string,
): Array<{ path: string; bytes: number; sha256: string }> {
  const root = dirname(schematicPath);
  const stem = basename(schematicPath, extname(schematicPath));
  const out: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const ext of ['.raw', '.log', '.net']) {
    const candidate = join(root, `${stem}${ext}`);
    const check = isPathAllowed(candidate, workspaceRoot);
    if (!check.allowed || !check.resolved || !existsSync(check.resolved) || !statSync(check.resolved).isFile()) {
      continue;
    }
    const bytes = readFileSync(check.resolved);
    out.push({
      path: relative(workspaceRoot, check.resolved),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return out;
}

const defaultSimulationRunner: LtspiceSimulationRunner = (executable, args, options) =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(executable, args, { cwd: options.cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    const stop = () => { cancelled = true; child.kill(); };
    options.signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs);
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', stop);
      resolve({ stdout, stderr, exitCode, durationMs: Date.now() - startedAt, timedOut, cancelled });
    });
    child.once('error', (error) => { stderr += error.message; });
  });
