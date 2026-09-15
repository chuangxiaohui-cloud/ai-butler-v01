/** E405：VS Code 工作区只读盘点；不启动编辑器、不执行 task、不写配置。 */

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

import { isPathAllowed } from '../security/sandbox.js';
import { deriveProjectId } from './project-profile-store.js';

export interface VsCodeTaskSummary {
  label: string;
  type: string | null;
  group: string | null;
  problemMatchers: string[];
  hasCommand: boolean;
}

export interface VsCodeWorkspaceInspection {
  projectId: string;
  workspaceRoot: string;
  configFiles: Array<{ kind: string; path: string }>;
  tasks: VsCodeTaskSummary[];
  launches: Array<{ name: string; type: string | null; request: string | null; program: string | null }>;
  cppConfigurations: Array<{
    name: string;
    compilerPath: string | null;
    intelliSenseMode: string | null;
    compileCommands: string | null;
    configurationProvider: string | null;
  }>;
  buildSettings: Record<string, string | null>;
  diagnosticMatchers: string[];
  configurationDiagnostics: Array<{ path: string; message: string }>;
  liveDiagnosticsAvailable: false;
  vscodeExecutable: string | null;
  observedAt: number;
}

const CONFIGS = [
  ['tasks', '.vscode/tasks.json'],
  ['launch', '.vscode/launch.json'],
  ['cpp', '.vscode/c_cpp_properties.json'],
  ['settings', '.vscode/settings.json'],
] as const;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'data']);

export function discoverVsCodeWorkspaces(rootPath: string, workspaceRoot = process.cwd()): string[] {
  const root = resolveDirectory(rootPath, workspaceRoot);
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === '.vscode') {
          found.add(relative(workspaceRoot, dir) || '.');
        } else if (!SKIP_DIRS.has(entry.name)) {
          walk(path);
        }
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.code-workspace') {
        found.add(relative(workspaceRoot, dirname(path)) || '.');
      }
    }
  };
  walk(root);
  return [...found].sort((a, b) => a.localeCompare(b));
}

export function inspectVsCodeWorkspace(input: {
  root: string;
  workspaceRoot?: string;
  executable?: string;
  now?: number;
}): VsCodeWorkspaceInspection {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const root = resolveDirectory(input.root, workspaceRoot);
  const configFiles: VsCodeWorkspaceInspection['configFiles'] = [];
  const configurationDiagnostics: VsCodeWorkspaceInspection['configurationDiagnostics'] = [];
  const parsed = new Map<string, Record<string, unknown>>();

  for (const [kind, relativePath] of CONFIGS) {
    const path = join(root, relativePath);
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    configFiles.push({ kind, path: relative(workspaceRoot, path) });
    try {
      const value = parseJsonc(readFileSync(path, 'utf-8'));
      if (!isRecord(value)) throw new Error('根节点必须是对象');
      parsed.set(kind, value);
    } catch (error) {
      configurationDiagnostics.push({
        path: relative(workspaceRoot, path),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const tasks = arrayOfRecords(parsed.get('tasks')?.tasks).map((task) => ({
    label: stringValue(task.label) ?? stringValue(task.taskName) ?? '(未命名任务)',
    type: stringValue(task.type),
    group: typeof task.group === 'string' ? task.group : stringValue(asRecord(task.group)?.kind),
    problemMatchers: stringArray(task.problemMatcher),
    hasCommand: typeof task.command === 'string' && task.command.trim().length > 0,
  }));
  const launches = arrayOfRecords(parsed.get('launch')?.configurations).map((launch) => ({
    name: stringValue(launch.name) ?? '(未命名启动配置)',
    type: stringValue(launch.type),
    request: stringValue(launch.request),
    program: stringValue(launch.program),
  }));
  const cppConfigurations = arrayOfRecords(parsed.get('cpp')?.configurations).map((config) => ({
    name: stringValue(config.name) ?? '(未命名 C/C++ 配置)',
    compilerPath: stringValue(config.compilerPath),
    intelliSenseMode: stringValue(config.intelliSenseMode),
    compileCommands: stringValue(config.compileCommands),
    configurationProvider: stringValue(config.configurationProvider),
  }));
  const settings = parsed.get('settings') ?? {};
  const buildSettings = Object.fromEntries([
    'C_Cpp.default.compilerPath',
    'C_Cpp.default.compileCommands',
    'cmake.generator',
    'cmake.buildDirectory',
  ].map((key) => [key, stringValue(settings[key])]));
  const vscodeExecutable = input.executable && existsSync(input.executable) && statSync(input.executable).isFile()
    ? input.executable
    : null;

  return {
    projectId: deriveProjectId(root),
    workspaceRoot: root,
    configFiles,
    tasks,
    launches,
    cppConfigurations,
    buildSettings,
    diagnosticMatchers: [...new Set(tasks.flatMap((task) => task.problemMatchers))],
    configurationDiagnostics,
    liveDiagnosticsAvailable: false,
    vscodeExecutable,
    observedAt: input.now ?? Date.now(),
  };
}

function resolveDirectory(path: string, workspaceRoot: string): string {
  const check = isPathAllowed(path, workspaceRoot);
  if (!check.allowed || !check.resolved) throw new Error(check.reason ?? '工作区路径不在沙箱内');
  if (!existsSync(check.resolved) || !statSync(check.resolved).isDirectory()) throw new Error('VS Code 工作区目录不存在');
  return check.resolved;
}

function parseJsonc(text: string): unknown {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    const next = text[index + 1];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index++;
      result += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index++;
      index++;
      continue;
    }
    result += char;
  }
  return JSON.parse(removeTrailingCommas(result));
}

function removeTrailingCommas(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    if (char === ',') {
      let lookahead = index + 1;
      while (/\s/.test(text[lookahead] ?? '')) lookahead++;
      if (text[lookahead] === '}' || text[lookahead] === ']') continue;
    }
    result += char;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}
