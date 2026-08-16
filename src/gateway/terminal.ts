/**
 * 终端真实执行通道（E115）
 * 仅当安全中心 Shell 权限开启时调用；结果含 stdout/stderr/exitCode。
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export async function runCommand(
  command: string,
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<RunCommandResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 15000;
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      cwd: opts.cwd,
    });
    return {
      stdout,
      stderr,
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
      durationMs: Date.now() - started,
    };
  }
}
