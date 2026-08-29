/**
 * 命令白名单初始集合（§10.2）
 * 仅允许白名单内的命令以完整命令串执行；危险模式硬编码拒绝（无论命令是否在白名单）。
 * 按类别返回超时（§11.1.3：[P-38] 编译构建 / [P-39] 烧录下载 / [P-40] 单文件生成）。
 * 越权/危险命令写审计日志（data/audit-command.jsonl）。
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { PARAMS } from '../config/params.js';

export type CommandKind = 'build' | 'flash' | 'pkg' | 'file' | 'test';

export interface CommandCheck {
  allowed: boolean;
  kind?: CommandKind;
  timeoutMs?: number;
  reason?: string;
}

/** §10.2 允许命令初始集合（按已安装工具链动态扩充） */
const ALLOWED_COMMANDS: Record<string, CommandKind> = {
  keil: 'build',
  gcc: 'build',
  cmake: 'build',
  make: 'build',
  ninja: 'build',
  cargo: 'build',
  openocd: 'flash',
  'st-flash': 'flash',
  'dfu-util': 'flash',
  jlink: 'flash',
  git: 'pkg',
  npm: 'pkg',
  pnpm: 'pkg',
  pip: 'pkg',
  cp: 'file',
  mv: 'file',
  mkdir: 'file',
  unzip: 'file',
  pytest: 'test',
  ctest: 'test',
};

/** §10.2 硬编码拒绝（不区分大小写匹配整条命令串） */
const HARD_REJECTS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|[\s;&|])sudo([\s]|$)/i, reason: 'sudo 硬编码拒绝' },
  { pattern: /(^|[\s;&|])eval([\s]|$)/i, reason: 'eval 硬编码拒绝' },
  { pattern: /\brm\b[^|;&]*\s+-r[fi]*\s+([\/]|\*|~\/)/i, reason: 'rm 递归删除根/通配/家目录拒绝' },
  { pattern: /\bdel\b[^|;&]*\/\s*[sSqQ]/i, reason: 'del /S /Q 批量删除拒绝' },
  { pattern: /\b(powershell|pwsh)\s+-(enc|encodedcommand)\b/i, reason: 'PowerShell 编码命令通道拒绝' },
  { pattern: /\bnode\s+(-e|--eval)\b/i, reason: 'node -e 解释器通道拒绝' },
  { pattern: /\b(curl|wget)\b[^|;&]*\|\s*(sh|bash|zsh|pwsh|powershell)\b/i, reason: '管道执行下载脚本拒绝' },
  { pattern: /\b(curl|wget)\b[^;]*\s+-o\s+\S+\.(exe|msi)\b/i, reason: '下载并执行 .exe/.msi 拒绝' },
  { pattern: /\b(mkfs|mkfs\.\w+|fdisk|format)\b/i, reason: '格式化/分区命令拒绝' },
];

/** git 破坏性子命令（§10.2：git 禁止 push --force 等破坏性操作） */
const GIT_DESTRUCTIVE = ['reset', 'clean', 'filter-branch', 'rebase', 'cherry-pick'];

export function checkCommand(
  cmdline: string,
  logPath = join(process.cwd(), 'data', 'audit-command.jsonl'),
): CommandCheck {
  const tokens = tokenize(cmdline);
  if (tokens.length === 0) {
    return { allowed: false, reason: '空命令' };
  }
  for (const rule of HARD_REJECTS) {
    if (rule.pattern.test(cmdline)) {
      logCommandAudit({ command: cmdline, allowed: false, reason: rule.reason, ts: new Date().toISOString() }, logPath);
      return { allowed: false, reason: rule.reason };
    }
  }
  const bin = basename(tokens[0] ?? '');
  const kind = ALLOWED_COMMANDS[bin];
  if (!kind) {
    const reason = `命令 ${bin} 不在白名单内`;
    logCommandAudit({ command: cmdline, allowed: false, reason, ts: new Date().toISOString() }, logPath);
    return { allowed: false, reason };
  }
  if (bin === 'git') {
    const destructive = gitDestructiveReason(tokens);
    if (destructive) {
      logCommandAudit({ command: cmdline, allowed: false, reason: destructive, ts: new Date().toISOString() }, logPath);
      return { allowed: false, reason: destructive };
    }
  }
  return { allowed: true, kind, timeoutMs: timeoutFor(kind) };
}

function gitDestructiveReason(tokens: string[]): string | null {
  const pushIndex = tokens.indexOf('push');
  if (pushIndex >= 0 && (tokens.includes('--force') || tokens.includes('-f'))) {
    return 'git push --force 破坏性操作拒绝';
  }
  for (const sub of GIT_DESTRUCTIVE) {
    if (tokens.includes(sub)) return `git ${sub} 破坏性操作拒绝`;
  }
  return null;
}

function timeoutFor(kind: CommandKind): number {
  switch (kind) {
    case 'build':
      return PARAMS.compileTimeoutMs; // [P-38]
    case 'flash':
      return PARAMS.flashTimeoutMs; // [P-39]
    default:
      return PARAMS.fileGenTimeoutMs; // [P-40]
  }
}

export function tokenize(cmdline: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cmdline)) !== null) {
    out.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return out;
}

export function logCommandAudit(
  entry: { command: string; allowed: boolean; reason?: string; ts: string },
  logPath = join(process.cwd(), 'data', 'audit-command.jsonl'),
): void {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8');
  } catch {
    // 审计日志失败不阻塞主流程
  }
}
