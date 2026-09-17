/**
 * E411：flash/串口能力契约。只定义门禁与证据形状，不打开设备、不烧录、不写串口。
 */

import { PARAMS } from '../config/params.js';

export const HARDWARE_ACTION_KINDS = ['flash', 'serial_read', 'serial_write'] as const;
export type HardwareActionKind = (typeof HARDWARE_ACTION_KINDS)[number];

export const SERIAL_MODES = ['read_only', 'write'] as const;
export type SerialMode = (typeof SERIAL_MODES)[number];

/** 禁止把 MCP 夹具/只读证据当成硬件授权来源 */
export const FORBIDDEN_AUTH_SOURCES = ['e410_fixture', 'mcp_fixture', 'model_candidate', 'build_approval'] as const;
export type ForbiddenAuthSource = (typeof FORBIDDEN_AUTH_SOURCES)[number];

export interface FirmwareDigest {
  path: string;
  sha256: string;
  byteLength: number;
  computedAt: number;
}

export interface HardwareGateRequest {
  action: HardwareActionKind;
  deviceId: string | null;
  /** 串口名（COM3 / /dev/ttyACM0）；flash 也可附带供占用检查 */
  port: string | null;
  serialMode?: SerialMode;
  firmware?: FirmwareDigest | null;
  /** 本次 flash 独立确认；不得复用构建批准或历史确认 */
  perFlashConfirmed?: boolean;
  /** 串口写操作独立确认 */
  serialWriteConfirmed?: boolean;
  /** 若调用方声称授权来源，门禁可拒绝禁止来源 */
  authorizationSource?: string | null;
  cancelled?: boolean;
  timedOut?: boolean;
}

export type HardwareDenyReason =
  | 'missing_device'
  | 'device_not_authorized'
  | 'forbidden_auth_source'
  | 'missing_firmware_digest'
  | 'flash_confirmation_required'
  | 'serial_write_denied'
  | 'serial_write_confirmation_required'
  | 'port_busy'
  | 'port_probe_disabled'
  | 'cancelled'
  | 'timed_out';

export interface HardwareGateDecision {
  allowed: boolean;
  action: HardwareActionKind;
  reason?: HardwareDenyReason;
  message: string;
  /** 契约层超时预算，引用 [P-39]；本轮不启动真实烧录进程 */
  timeoutMs: number;
  audit: {
    deviceId: string | null;
    port: string | null;
    firmwareSha256: string | null;
    perFlashConfirmed: boolean;
    serialMode: SerialMode | null;
  };
}

export function isForbiddenAuthSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return (FORBIDDEN_AUTH_SOURCES as readonly string[]).includes(source);
}

export function isHardwareFlashQuery(query: string): boolean {
  return /(?:烧录|下载固件|刷机|\bflash\b|\.FlashProject\b)/i.test(query);
}

export function isHardwareSerialQuery(query: string): boolean {
  return /(?:串口|serial\s*port|\bCOM\d+\b|tty(?:USB|ACM)\d+)/i.test(query)
    && !isHardwareFlashQuery(query);
}

export function isHardwareCapabilityQuery(query: string): boolean {
  return isHardwareFlashQuery(query) || isHardwareSerialQuery(query);
}

export function flashTimeoutMs(): number {
  return PARAMS.flashTimeoutMs;
}

export function validateFirmwareDigest(value: unknown): value is FirmwareDigest {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m.path === 'string'
    && m.path.length > 0
    && typeof m.sha256 === 'string'
    && /^[a-f0-9]{64}$/i.test(m.sha256)
    && Number.isInteger(m.byteLength)
    && Number(m.byteLength) >= 0
    && Number.isFinite(m.computedAt)
    && Number(m.computedAt) >= 0;
}
