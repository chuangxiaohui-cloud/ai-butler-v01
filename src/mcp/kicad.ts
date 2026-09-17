/** E409：KiCad 工程只读盘点与 ERC；不修改原理图或工程配置。 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative } from 'node:path';

import { PARAMS } from '../config/params.js';
import { isPathAllowed } from '../security/sandbox.js';

export interface KiCadProjectInspection {
  projectRoot: string;
  projectPath: string;
  projectFile: string | null;
  schematicFiles: string[];
  boardFiles: string[];
  schematicCount: number;
  boardCount: number;
  symbolCount: number;
  labelCount: number;
  hierarchicalSheetCount: number;
  configurationDiagnostics: Array<{ path: string; message: string }>;
  cliAvailable: boolean;
}

export interface KiCadErcRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
}

export type KiCadErcRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal },
) => Promise<KiCadErcRunnerResult>;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'data']);

export function discoverKiCadProjects(rootPath: string, workspaceRoot = process.cwd()): string[] {
  const root = resolveDirectory(rootPath, workspaceRoot);
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (entry.isFile() && ['.kicad_pro', '.kicad_sch'].includes(extname(entry.name).toLowerCase())) {
        found.add(relative(workspaceRoot, path));
      }
    }
  };
  walk(root);
  return [...found].sort((a, b) => a.localeCompare(b));
}

export function inspectKiCadProject(input: {
  projectPath: string;
  workspaceRoot?: string;
  executable?: string;
}): KiCadProjectInspection {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const projectPath = resolveFile(input.projectPath, workspaceRoot, ['.kicad_pro', '.kicad_sch']);
  const projectRoot = dirname(projectPath);
  const stem = basename(projectPath, extname(projectPath));
  const projectCandidate = join(projectRoot, `${stem}.kicad_pro`);
  const projectFile = existsSync(projectCandidate) ? projectCandidate : null;
  const schematicFiles = listFiles(projectRoot, '.kicad_sch', workspaceRoot);
  const boardFiles = listFiles(projectRoot, '.kicad_pcb', workspaceRoot);
  const configurationDiagnostics: KiCadProjectInspection['configurationDiagnostics'] = [];
  if (projectFile) {
    try {
      JSON.parse(readFileSync(projectFile, 'utf8'));
    } catch (error) {
      configurationDiagnostics.push({
        path: relative(workspaceRoot, projectFile),
        message: `工程配置无法解析：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  const schematicText = schematicFiles.map((path) => readFileSync(path, 'utf8')).join('\n');
  return {
    projectRoot,
    projectPath,
    projectFile,
    schematicFiles,
    boardFiles,
    schematicCount: schematicFiles.length,
    boardCount: boardFiles.length,
    symbolCount: countMatches(schematicText, /\(symbol\s+\(lib_id\b/g),
    labelCount: countMatches(schematicText, /\((?:label|global_label|hierarchical_label)\b/g),
    hierarchicalSheetCount: countMatches(schematicText, /\(sheet\b/g),
    configurationDiagnostics,
    cliAvailable: Boolean(input.executable && existsSync(input.executable) && statSync(input.executable).isFile()),
  };
}

export async function runKiCadErc(input: {
  schematicPath: string;
  executable: string;
  workspaceRoot?: string;
  runner?: KiCadErcRunner;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  sourceUnchanged: boolean;
  reportGenerated: boolean;
  reportRetained: false;
  violations: unknown[];
  errorCount: number;
  warningCount: number;
  exclusionCount: number;
  stdout: string;
  stderr: string;
}> {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const schematicPath = resolveFile(input.schematicPath, workspaceRoot, ['.kicad_sch']);
  if (!existsSync(input.executable) || !statSync(input.executable).isFile()) {
    throw new Error('KiCad CLI 不可用，请先登记 kicad-cli.exe 的真实路径');
  }
  const before = fileHash(schematicPath);
  const reportDir = mkdtempSync(join(tmpdir(), 'ai-butler-kicad-erc-'));
  const reportPath = join(reportDir, 'erc.json');
  try {
    const args = [
      'sch', 'erc', '--output', reportPath, '--format', 'json', '--severity-all',
      '--exit-code-violations', schematicPath,
    ];
    const result = await (input.runner ?? defaultRunner)(input.executable, args, {
      cwd: dirname(schematicPath),
      timeoutMs: PARAMS.fileGenTimeoutMs,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const reportGenerated = existsSync(reportPath) && statSync(reportPath).isFile();
    let violations: unknown[] = [];
    if (reportGenerated) {
      try {
        violations = collectViolations(JSON.parse(readFileSync(reportPath, 'utf8')));
      } catch {
        violations = [];
      }
    }
    const sourceUnchanged = before === fileHash(schematicPath);
    const cancelled = result.cancelled ?? false;
    const severityOf = (item: unknown) => typeof item === 'object' && item !== null
      ? String((item as Record<string, unknown>).severity ?? '').toLowerCase()
      : '';
    const isExcluded = (item: unknown) => typeof item === 'object' && item !== null
      && ((item as Record<string, unknown>).excluded === true || (item as Record<string, unknown>).exclusion === true);
    const errorCount = violations.filter((item) => severityOf(item) === 'error').length;
    const warningCount = violations.filter((item) => severityOf(item) === 'warning').length;
    const exclusionCount = violations.filter(isExcluded).length;
    // KiCad 10 用 --severity-all 时警告也会令 exit≠0；业务验收以 error 清零为准
    return {
      ok: reportGenerated && errorCount === 0 && !result.timedOut && !cancelled && sourceUnchanged,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      cancelled,
      sourceUnchanged,
      reportGenerated,
      reportRetained: false,
      violations,
      errorCount,
      warningCount,
      exclusionCount,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

function resolveDirectory(path: string, workspaceRoot: string): string {
  const check = isPathAllowed(path, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '目录不在沙箱内');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isDirectory()) throw new Error('KiCad 盘点目录不存在');
  return check.resolved;
}

function resolveFile(path: string, workspaceRoot: string, extensions: string[]): string {
  const check = isPathAllowed(path, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '文件不在沙箱内');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isFile()) throw new Error('KiCad 工程文件不存在');
  if (!extensions.includes(extname(check.resolved).toLowerCase())) throw new Error('不支持的 KiCad 文件类型');
  return check.resolved;
}

function listFiles(root: string, extension: string, workspaceRoot: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && extname(entry.name).toLowerCase() === extension)
    .map((entry) => join(root, entry.name))
    .filter((path) => isPathAllowed(path, workspaceRoot).allowed)
    .sort((a, b) => a.localeCompare(b));
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function fileHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function collectViolations(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object' || value === null) return [];
  const record = value as Record<string, unknown>;
  for (const key of ['violations', 'items', 'errors']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  // KiCad 10 JSON：违规嵌在 sheets[].violations
  if (Array.isArray(record.sheets)) {
    const nested: unknown[] = [];
    for (const sheet of record.sheets) {
      if (typeof sheet !== 'object' || sheet === null) continue;
      const violations = (sheet as Record<string, unknown>).violations;
      if (Array.isArray(violations)) nested.push(...violations);
    }
    return nested;
  }
  return [];
}

const defaultRunner: KiCadErcRunner = (executable, args, options) => new Promise((resolve) => {
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
