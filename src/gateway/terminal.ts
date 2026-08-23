/**
 * 终端真实执行通道（E115，SEV-1.3 修复）
 * - 改用 spawn(cmd, args[], { shell: false })，禁用 shell 解析，杜绝 `cmd; rm -rf`
 *   这种"前缀白名单被 `;` 串联绕开"的注入。
 * - 整个 command 字符串里出现 shell 元字符（;|&`$()<>、通配符、引号、反引号、
 *   ~、!、#、\、换行）一律拒绝；白名单只允许"空格分隔的 argv"。
 * - maxBuffer 1MB/流，超出截断并标注，避免 `cat /dev/zero` 把网关撑爆。
 * - 超时 SIGTERM → 1s 后 SIGKILL，避免子进程忽略 SIGTERM 后继续输出。
 *
 * H3（架构审计 2026-08-23）：新增 classifyCommand——§10.2 硬编码拒绝表
 * （rm -rf <根>、del/rd /S、sudo、eval、format、PowerShell -EncodedCommand）
 * 无条件拦截；解释器通道（node -e、python -c、powershell -Command 等）标记后
 * 由网关层要求"白名单显式放行"。
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

// 仅拦截命令结构分隔符；其余 ()$` 字符在 shell:false 下为字面量，
// 留给调用方程序自行解析（如 node -e "code"、npm scripts 含 () 都是合法场景）。
const SHELL_META = /[;|&<>]/;
const MAX_BUFFER = 1024 * 1024; // 1 MiB per stream
const DEFAULT_TIMEOUT_MS = 15000;

export interface CommandPolicy {
  /** 硬编码拒绝原因（§10.2：无论是否在白名单都拒绝） */
  hardDenied?: string;
  /** 解释器通道描述（需网关层要求白名单显式放行） */
  interpreterChannel?: string;
}

// §10.2 硬编码拒绝表：危险模式无条件拦截。
// spawn(shell:false) 下这些命令可经自身 argv 完成破坏，不依赖 shell 元字符。
const HARD_DENY_RULES: ReadonlyArray<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(\/|~|\/\*)/i, reason: 'rm -rf 根目录/主目录' },
  { re: /\b(del|rd|rmdir)\s+\/s(\s+\/q)?\s+/i, reason: 'del/rd /S 递归删除' },
  { re: /\b(sudo|eval)\b/i, reason: 'sudo/eval 为 §10.2 硬编码拒绝项' },
  { re: /\bformat\s+[a-zA-Z]:/i, reason: '磁盘格式化命令' },
  { re: /\b(powershell|pwsh)\s+-(enc|encodedcommand)(\s|$)/i, reason: 'PowerShell -EncodedCommand 编码命令通道' },
];

// 解释器通道：即使命令本身在白名单前缀内，也要求白名单显式写全通道（如 "node -e"）。
const INTERPRETER_CHANNELS: ReadonlyArray<{ re: RegExp; channel: string }> = [
  { re: /\bnode\s+(-e|--eval)\b/i, channel: 'node -e' },
  { re: /\b(python|python3|py)\s+-c\b/i, channel: 'python -c' },
  { re: /\b(powershell|pwsh)\s+(-command|-c|-enc|-encodedcommand)\b/i, channel: 'powershell -command' },
  { re: /\b(cmd|sh|bash|zsh)\s+(-c|-command)\b/i, channel: 'sh -c' },
];

/** 安全策略分类：硬拒绝 + 解释器通道标记（网关层复用，§10.2 兜底） */
export function classifyCommand(command: string): CommandPolicy {
  for (const rule of HARD_DENY_RULES) {
    if (rule.re.test(command)) return { hardDenied: rule.reason };
  }
  for (const rule of INTERPRETER_CHANNELS) {
    if (rule.re.test(command)) return { interpreterChannel: rule.channel };
  }
  return {};
}

function rejectMeta(command: string): string | null {
  const match = command.match(SHELL_META);
  if (!match) return null;
  return `命令包含 shell 元字符 '${match[0]}'，已拒绝。请改用空格分隔的 argv 形式。`;
}

export async function runCommand(
  command: string,
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<RunCommandResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (typeof command !== 'string' || command.trim() === '') {
    return { stdout: '', stderr: '命令为空', exitCode: 1, durationMs: 0 };
  }
  const metaErr = rejectMeta(command);
  if (metaErr) {
    return { stdout: '', stderr: metaErr, exitCode: 1, durationMs: 0 };
  }
  const policy = classifyCommand(command);
  if (policy.hardDenied) {
    return { stdout: '', stderr: `命令被安全策略拒绝：${policy.hardDenied}`, exitCode: 1, durationMs: 0 };
  }
  const argv = command.trim().split(/\s+/).filter(Boolean);
  if (argv.length === 0) {
    return { stdout: '', stderr: '空命令', exitCode: 1, durationMs: 0 };
  }

  return await new Promise<RunCommandResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;

    let child: ChildProcess;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd: opts.cwd,
        shell: false, // 关键：不走 cmd.exe / sh，杜绝元字符解释
        windowsHide: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ stdout: '', stderr: `spawn 失败: ${msg}`, exitCode: 127, durationMs: Date.now() - started });
      return;
    }

    const timer = setTimeout(() => {
      killedByTimeout = true;
      try {
        child.kill('SIGTERM');
      } catch {
        /* 已退出 */
      }
      // 兜底 SIGKILL 避免 SIGTERM 被忽略导致僵尸
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* noop */
        }
      }, 1000).unref();
    }, timeoutMs);

    const stdoutTrunc = { v: false };
    const stderrTrunc = { v: false };
    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        if (stdoutTrunc.v) return;
        if (stdout.length >= MAX_BUFFER) {
          stdoutTrunc.v = true;
          return;
        }
        const text = chunk.toString('utf-8');
        const remaining = MAX_BUFFER - stdout.length;
        stdout += text.slice(0, remaining);
        if (text.length > remaining) stdoutTrunc.v = true;
      });
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrTrunc.v) return;
        if (stderr.length >= MAX_BUFFER) {
          stderrTrunc.v = true;
          return;
        }
        const text = chunk.toString('utf-8');
        const remaining = MAX_BUFFER - stderr.length;
        stderr += text.slice(0, remaining);
        if (text.length > remaining) stderrTrunc.v = true;
      });
    }

    child.on('error', (err) => {
      clearTimeout(timer);
      const msg = err.message ?? String(err);
      resolve({
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}spawn error: ${msg}`,
        exitCode: 127, // 与 shell 语义一致：命令未找到
        durationMs: Date.now() - started,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdoutTrunc.v) stdout += `\n[output truncated at ${MAX_BUFFER} bytes]`;
      if (stderrTrunc.v) stderr += `\n[output truncated at ${MAX_BUFFER} bytes]`;
      resolve({
        stdout,
        stderr,
        exitCode: killedByTimeout ? 124 : code ?? 1,
        durationMs: Date.now() - started,
      });
    });
  });
}
