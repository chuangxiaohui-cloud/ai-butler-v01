/** E409：LTspice 原理图只读盘点；不启动仿真、不生成输出文件。 */

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

import { isPathAllowed } from '../security/sandbox.js';

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
