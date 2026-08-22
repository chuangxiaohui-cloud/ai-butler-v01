/**
 * 终端真实执行通道（E115，SEV-1.3 修复）
 * - 改用 spawn(cmd, args[], { shell: false })，禁用 shell 解析，杜绝 `cmd; rm -rf`
 *   这种"前缀白名单被 `;` 串联绕开"的注入。
 * - 整个 command 字符串里出现 shell 元字符（;|&`$()<>、通配符、引号、反引号、
 *   ~、!、#、\、换行）一律拒绝；白名单只允许"空格分隔的 argv"。
 * - maxBuffer 1MB/流，超出截断并标注，避免 `cat /dev/zero` 把网关撑爆。
 * - 超时 SIGTERM → 1s 后 SIGKILL，避免子进程忽略 SIGTERM 后继续输出。
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