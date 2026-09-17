/**
 * E420/E422/E423：受控 flash 驱动。必须先通过 E411 门禁；默认不烧录，仅在显式执行路径 spawn。
 * 禁止 shell、禁止任意 argv；工具模板白名单（st-flash / pyocd / openocd / dfu-util / jlink）。
 * E422：openocd 仅固定 -f 配置形态 + 驱动拼出的 program 命令，禁止调用方自由 -c。
 * E423：dfu-util 固定 -a/-D（可选 -s addr:leave）；jlink 设备/接口/速度白名单 + 驱动生成 CommanderScript。
 */

import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { PARAMS } from '../config/params.js';
import { isPathAllowed } from '../security/sandbox.js';
import { computeFirmwareDigest } from './firmware-digest.js';
import type { HardwareGateDecision } from './hardware-capability.js';

export const FLASH_TOOL_KINDS = ['st-flash', 'pyocd', 'openocd', 'dfu-util', 'jlink'] as const;
export type FlashToolKind = (typeof FLASH_TOOL_KINDS)[number];

export const JLINK_INTERFACES = ['SWD', 'JTAG'] as const;
export type JlinkInterface = (typeof JLINK_INTERFACES)[number];

export const JLINK_SPEED_WHITELIST = Object.freeze([
  5, 10, 20, 50, 100, 200, 400, 500, 800, 1000, 2000, 3000, 4000, 6000, 8000, 12000, 15000, 50000,
] as const);

export interface FlashRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
}

export type FlashRunner = (
  executable: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal },
) => Promise<FlashRunnerResult>;

export interface OpenocdFlashOptions {
  /** 单 board 配置，如 board/stm32f4discovery.cfg */
  openocdCfg?: string;
  /** 与 openocdTargetCfg 成对使用 */
  openocdInterfaceCfg?: string;
  openocdTargetCfg?: string;
}

export interface DfuFlashOptions {
  /** DFU alternate setting；默认 0 */
  dfuAlt?: number;
}

export interface JlinkFlashOptions {
  /** 芯片名，如 STM32F103C8 */
  jlinkDevice?: string;
  jlinkInterface?: JlinkInterface;
  jlinkSpeed?: number;
  /** 仅由驱动写入后传入；禁止调用方自由脚本 */
  jlinkCommanderScriptPath?: string;
}

export interface BuildFlashArgsOptions extends OpenocdFlashOptions, DfuFlashOptions, JlinkFlashOptions {
  flashAddress?: string;
}

export interface RunAuthorizedFlashInput extends OpenocdFlashOptions, DfuFlashOptions, JlinkFlashOptions {
  /** 必须已是 action=flash 且 allowed=true 的门禁裁决 */
  gate: HardwareGateDecision;
  firmwarePath: string;
  /** 门禁时使用的摘要；执行前复算必须一致 */
  expectedSha256: string;
  executable: string;
  toolKind?: FlashToolKind;
  flashAddress?: string;
  runner?: FlashRunner;
  signal?: AbortSignal;
  workspaceRoot?: string;
}

export interface RunAuthorizedFlashResult {
  ok: boolean;
  flashExecuted: true;
  toolKind: FlashToolKind;
  args: string[];
  firmwarePath: string;
  firmwareSha256: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  stdout: string;
  stderr: string;
  message: string;
}

const DEFAULT_FLASH_ADDRESS = '0x08000000';
/** OpenOCD 脚本相对路径：仅 interface|target|board 下安全文件名 */
const OPENOCD_CFG_RE = /^(?:interface|target|board)\/[A-Za-z0-9][A-Za-z0-9._-]*\.cfg$/;
const JLINK_DEVICE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export function isFlashToolKind(value: unknown): value is FlashToolKind {
  return typeof value === 'string' && (FLASH_TOOL_KINDS as readonly string[]).includes(value);
}

export function normalizeFlashAddress(address: string | undefined): string {
  const value = (address ?? DEFAULT_FLASH_ADDRESS).trim();
  if (!/^0x[0-9a-fA-F]{1,8}$/.test(value)) {
    throw new Error(`烧录地址非法（仅允许 0x 十六进制）：${value}`);
  }
  return value.toLowerCase();
}

/** 禁止绝对路径、.. 与任意 TCL；仅允许 OpenOCD 惯用相对 cfg。 */
export function normalizeOpenocdCfg(cfgPath: string): string {
  const value = cfgPath.trim().replace(/\\/g, '/');
  if (!OPENOCD_CFG_RE.test(value)) {
    throw new Error(
      `openocd 配置路径非法（仅允许 interface|target|board/<name>.cfg）：${cfgPath}`,
    );
  }
  return value;
}

export function normalizeDfuAlt(alt: number | undefined): number {
  const value = alt ?? 0;
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`dfu-util alt 非法（仅允许 0–255 整数）：${String(alt)}`);
  }
  return value;
}

export function normalizeJlinkDevice(device: string | undefined): string {
  const value = (device ?? '').trim();
  if (!JLINK_DEVICE_RE.test(value)) {
    throw new Error(`jlink 设备名非法（字母数字/_/-，最长 32）：${String(device)}`);
  }
  return value;
}

export function normalizeJlinkInterface(iface: string | undefined): JlinkInterface {
  const value = (iface ?? 'SWD').trim().toUpperCase();
  if (!(JLINK_INTERFACES as readonly string[]).includes(value)) {
    throw new Error(`jlink 接口非法（仅 SWD/JTAG）：${String(iface)}`);
  }
  return value as JlinkInterface;
}

export function normalizeJlinkSpeed(speed: number | undefined): number {
  const value = speed ?? 4000;
  if (!(JLINK_SPEED_WHITELIST as readonly number[]).includes(value)) {
    throw new Error(
      `jlink 速度不在白名单：${value}；允许 ${JLINK_SPEED_WHITELIST.join('/')}`,
    );
  }
  return value;
}

/** 仅允许 loadfile + r + g + exit；固件路径禁止换行注入。 */
export function buildJlinkCommanderScript(firmwarePath: string): string {
  if (/[\n\r]/.test(firmwarePath)) {
    throw new Error('固件路径含换行，拒绝写入 jlink CommanderScript');
  }
  return `loadfile ${firmwarePath}\nr\ng\nexit\n`;
}

function quoteOpenocdFirmwarePath(firmwarePath: string): string {
  if (/[{}"\n\r;]/.test(firmwarePath)) {
    throw new Error('固件路径含非法字符，拒绝拼入 openocd -c');
  }
  return `{${firmwarePath}}`;
}

/** 固定工具模板；禁止调用方自由拼 argv。 */
export function buildFlashArgs(
  toolKind: FlashToolKind,
  firmwarePath: string,
  options?: BuildFlashArgsOptions,
): string[] {
  if (toolKind === 'st-flash') {
    const address = normalizeFlashAddress(options?.flashAddress);
    return ['write', firmwarePath, address];
  }
  if (toolKind === 'pyocd') {
    return ['flash', firmwarePath];
  }
  if (toolKind === 'dfu-util') {
    const alt = normalizeDfuAlt(options?.dfuAlt);
    const args = ['-a', String(alt)];
    if (options?.flashAddress) {
      args.push('-s', `${normalizeFlashAddress(options.flashAddress)}:leave`);
    }
    args.push('-D', firmwarePath);
    return args;
  }
  if (toolKind === 'jlink') {
    const device = normalizeJlinkDevice(options?.jlinkDevice);
    const iface = normalizeJlinkInterface(options?.jlinkInterface);
    const speed = normalizeJlinkSpeed(options?.jlinkSpeed);
    const script = options?.jlinkCommanderScriptPath?.trim();
    if (!script) {
      throw new Error('jlink 须由驱动提供 CommanderScript 路径（禁止调用方自由脚本）');
    }
    return [
      '-device', device,
      '-if', iface,
      '-speed', String(speed),
      '-autoconnect', '1',
      '-CommanderScript', script,
    ];
  }

  // openocd：仅 -f（白名单相对 cfg）+ 驱动拼出的唯一 -c program 命令
  const args: string[] = [];
  if (options?.openocdCfg) {
    if (options.openocdInterfaceCfg || options.openocdTargetCfg) {
      throw new Error('openocd 不可同时指定 board 与 interface/target');
    }
    args.push('-f', normalizeOpenocdCfg(options.openocdCfg));
  } else if (options?.openocdInterfaceCfg && options?.openocdTargetCfg) {
    args.push('-f', normalizeOpenocdCfg(options.openocdInterfaceCfg));
    args.push('-f', normalizeOpenocdCfg(options.openocdTargetCfg));
  } else {
    throw new Error('openocd 须提供 openocdCfg，或 openocdInterfaceCfg+openocdTargetCfg');
  }
  const quoted = quoteOpenocdFirmwarePath(firmwarePath);
  const programCmd = options?.flashAddress
    ? `program ${quoted} ${normalizeFlashAddress(options.flashAddress)} verify reset exit`
    : `program ${quoted} verify reset exit`;
  args.push('-c', programCmd);
  return args;
}

export async function runAuthorizedFlash(
  input: RunAuthorizedFlashInput,
): Promise<RunAuthorizedFlashResult> {
  if (!input.gate.allowed || input.gate.action !== 'flash') {
    throw new Error('flash 驱动拒绝执行：硬件门禁未通过或非 flash 动作');
  }
  if (!input.gate.audit.perFlashConfirmed) {
    throw new Error('flash 驱动拒绝执行：缺少本次独立烧录确认');
  }

  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const pathCheck = isPathAllowed(input.firmwarePath, workspaceRoot);
  if (!pathCheck.allowed || !pathCheck.resolved) {
    throw new Error(pathCheck.reason ?? '固件路径不在沙箱内');
  }
  const digest = computeFirmwareDigest(pathCheck.resolved);
  if (!digest.ok) {
    throw new Error(`固件摘要复算失败：${digest.reason}`);
  }
  if (digest.digest.sha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
    throw new Error('固件摘要与门禁记录不一致；拒绝烧录（防掉包/替换）');
  }
  if (!existsSync(input.executable) || !statSync(input.executable).isFile()) {
    throw new Error(
      'flash 可执行文件不可用；请配置真实工具路径（如 st-flash / pyocd / openocd / dfu-util / JLink）',
    );
  }

  const toolKind: FlashToolKind = input.toolKind ?? 'st-flash';
  if (!isFlashToolKind(toolKind)) {
    throw new Error(`不支持的 flash 工具：${String(toolKind)}`);
  }

  let jlinkScriptDir: string | null = null;
  let jlinkCommanderScriptPath: string | undefined = input.jlinkCommanderScriptPath;
  try {
    if (toolKind === 'jlink') {
      // 禁止信任调用方脚本：始终由驱动生成 loadfile/r/g/exit
      jlinkScriptDir = mkdtempSync(join(tmpdir(), 'jlink-flash-'));
      jlinkCommanderScriptPath = join(jlinkScriptDir, 'flash.jlink');
      writeFileSync(
        jlinkCommanderScriptPath,
        buildJlinkCommanderScript(pathCheck.resolved),
        'utf-8',
      );
    }

    const args = buildFlashArgs(toolKind, pathCheck.resolved, {
      ...(input.flashAddress ? { flashAddress: input.flashAddress } : {}),
      ...(input.openocdCfg ? { openocdCfg: input.openocdCfg } : {}),
      ...(input.openocdInterfaceCfg ? { openocdInterfaceCfg: input.openocdInterfaceCfg } : {}),
      ...(input.openocdTargetCfg ? { openocdTargetCfg: input.openocdTargetCfg } : {}),
      ...(input.dfuAlt !== undefined ? { dfuAlt: input.dfuAlt } : {}),
      ...(input.jlinkDevice ? { jlinkDevice: input.jlinkDevice } : {}),
      ...(input.jlinkInterface ? { jlinkInterface: input.jlinkInterface } : {}),
      ...(input.jlinkSpeed !== undefined ? { jlinkSpeed: input.jlinkSpeed } : {}),
      ...(jlinkCommanderScriptPath ? { jlinkCommanderScriptPath } : {}),
    });
    const timeoutMs = input.gate.timeoutMs > 0 ? input.gate.timeoutMs : PARAMS.flashTimeoutMs;
    const runner = input.runner ?? defaultFlashRunner;
    const result = await runner(input.executable, args, {
      timeoutMs,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const cancelled = result.cancelled === true;
    const ok = !result.timedOut && !cancelled && result.exitCode === 0;
    return {
      ok,
      flashExecuted: true,
      toolKind,
      args,
      firmwarePath: pathCheck.resolved,
      firmwareSha256: digest.digest.sha256,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      cancelled,
      stdout: result.stdout,
      stderr: result.stderr,
      message: ok
        ? `烧录完成（${toolKind}，exit=${result.exitCode}）。`
        : `烧录未成功（${toolKind}，exit=${result.exitCode ?? 'null'}，timeout=${result.timedOut}，cancelled=${cancelled}）。`,
    };
  } finally {
    if (jlinkScriptDir) {
      rmSync(jlinkScriptDir, { recursive: true, force: true });
    }
  }
}

const defaultFlashRunner: FlashRunner = (executable, args, options) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (payload: FlashRunnerResult) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        stdout,
        stderr: stderr || 'flash 超时',
        exitCode: null,
        durationMs: Date.now() - started,
        timedOut: true,
      });
    }, options.timeoutMs);

    const onAbort = () => {
      child.kill();
      finish({
        stdout,
        stderr: stderr || 'flash 已取消',
        exitCode: null,
        durationMs: Date.now() - started,
        timedOut: false,
        cancelled: true,
      });
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      finish({
        stdout,
        stderr: err.message,
        exitCode: null,
        durationMs: Date.now() - started,
        timedOut: false,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      finish({
        stdout,
        stderr,
        exitCode: code,
        durationMs: Date.now() - started,
        timedOut: false,
      });
    });
  });
