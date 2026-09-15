/**
 * Skill: archify 渲染封装（E352）
 * 把 vendor 的 archify.mjs validate/deliver 封装成可测试的子进程调用。
 * 子进程用本进程 node（process.execPath）执行 vendor 脚本，并把 TEMP/TMP 指到
 * <workspace>/data/.archify-tmp——生产侧保持系统临时目录干净，测试沙箱内也能跑通
 * （vendor 内部会用系统临时目录渲染校验中间件，而 Codex 沙箱不允许 realpath 用户主目录）。
 * 同时置 ARCHIFY_UPDATE_CHECK_DISABLED=1：集成后不发起更新检查联网与写提醒状态。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const ARCHIFY_TYPES = [
  'architecture',
  'workflow',
  'sequence',
  'dataflow',
  'lifecycle',
] as const;

export type ArchifyType = (typeof ARCHIFY_TYPES)[number];
export type ArchifyQuality = 'standard' | 'showcase';

export interface ArchifyRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ArchifyDiagnostic {
  code: string;
  severity: string;
  message: string;
  subject: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  supportedFixes: string[];
}

export interface ArchifyReceipt {
  ok: boolean;
  command: string;
  type?: string;
  input?: string;
  output?: string;
  error?: string;
  checks?: Array<{ name: string; ok: boolean }>;
  diagnostics?: ArchifyDiagnostic[];
  validation?: {
    checksPassed?: number;
    checkCount?: number;
    compositionProfile?: string;
    compositionStatus?: string;
    errors?: number;
    warnings?: number;
  };
  specification?: { sha256: string; bytes: number };
  artifact?: { sha256: string; bytes: number };
}

export type ArchifyRunner = (
  args: string[],
  opts: { vendorDir: string; cwd: string; workTmp: string },
) => Promise<ArchifyRunResult>;

/**
 * vendor 定位：dev（tsx 跑 src）时在 src 内找；构建产物（dist）里没有静态 vendor，
 * 回落工作区 src 路径。两形态都找不到时返回 HERE 下的默认路径（调用方再给缺失提示）。
 */
export function defaultVendorDir(): string {
  const candidates = [
    join(HERE, 'vendor', 'archify'),
    join(HERE, '..', '..', '..', 'src', 'skills', 'archify', 'vendor', 'archify'),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'bin', 'archify.mjs'))) return candidate;
    } catch {
      // 探测失败尝试下一候选
    }
  }
  return candidates[0];
}

/** 默认 runner：本进程 node 直跑 vendor bin/archify.mjs（Windows 无需走 cmd shim） */
export function defaultArchifyRunner(timeoutMs = 180_000): ArchifyRunner {
  return (args, { vendorDir, cwd, workTmp }) =>
    new Promise((resolveRun, reject) => {
      try {
        mkdirSync(workTmp, { recursive: true });
      } catch {
        // 临时目录建不出来不致命：仅保持系统默认 TEMP
      }
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...(workTmp ? { TEMP: workTmp, TMP: workTmp, TMPDIR: workTmp } : {}),
        ARCHIFY_UPDATE_CHECK_DISABLED: '1',
      };
      const child = spawn(process.execPath, [join(vendorDir, 'bin', 'archify.mjs'), ...args], {
        cwd,
        env,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolveRun({ code: code ?? -1, stdout, stderr });
      });
    });
}

function parseJsonOutput(text: string): ArchifyReceipt | null {
  const candidates = [text.trim(), text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/u, '')];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && typeof parsed.ok === 'boolean') {
        return parsed as ArchifyReceipt;
      }
    } catch {
      // 尝试下一种形态
    }
  }
  return null;
}

async function runArchifyJson(
  run: ArchifyRunner,
  args: string[],
  vendorDir: string,
  cwd: string,
  workTmp: string,
): Promise<ArchifyReceipt> {
  const res = await run(args, { vendorDir, cwd, workTmp });
  const receipt = parseJsonOutput(res.stdout) ?? parseJsonOutput(res.stderr);
  if (!receipt) {
    return {
      ok: false,
      command: args[0] ?? 'archify',
      error: `无法解析 archify 输出（退出码 ${res.code}）：\n${(res.stderr || res.stdout).slice(0, 500)}`,
    };
  }
  return receipt;
}

/** validate：校验候选 JSON IR；收据含 checks + diagnostics（可修复建议） */
export function archifyValidate(
  run: ArchifyRunner,
  type: ArchifyType,
  jsonPath: string,
  quality: ArchifyQuality,
  vendorDir = defaultVendorDir(),
  cwd = process.cwd(),
  workTmp = join(cwd, 'data', '.archify-tmp'),
): Promise<ArchifyReceipt> {
  return runArchifyJson(run, ['validate', type, jsonPath, '--quality', quality, '--json'], vendorDir, cwd, workTmp);
}

/** deliver：最终验收 + 渲染 HTML 到 outHtml；收据含 specification/artifact 哈希与校验汇总 */
export function archifyDeliver(
  run: ArchifyRunner,
  type: ArchifyType,
  jsonPath: string,
  outHtml: string,
  quality: ArchifyQuality,
  vendorDir = defaultVendorDir(),
  cwd = process.cwd(),
  workTmp = join(cwd, 'data', '.archify-tmp'),
): Promise<ArchifyReceipt> {
  return runArchifyJson(
    run,
    ['deliver', type, jsonPath, outHtml, '--quality', quality, '--json'],
    vendorDir,
    cwd,
    workTmp,
  );
}

/** 诊断收集中面向人的一句摘要（截断防刷屏） */
export function summarizeDiagnostics(diagnostics: ArchifyDiagnostic[], max = 6): string {
  if (!diagnostics || diagnostics.length === 0) return '';
  const lines = diagnostics.slice(0, max).map((d) => {
    const subject = d.subject?.id ? `（${String(d.subject.id)}）` : '';
    return `- [${d.code}]${subject} ${d.message.split('\n')[0]}`;
  });
  const rest = diagnostics.length > max ? `\n…等共 ${diagnostics.length} 条诊断` : '';
  return lines.join('\n') + rest;
}

/** 错误/警告计数（修复循环的客观改善指标） */
export function countDiagnostics(diagnostics: ArchifyDiagnostic[] | undefined): number {
  return diagnostics?.length ?? 0;
}
