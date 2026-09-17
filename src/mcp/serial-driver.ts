/**
 * E421：受控串口只读驱动。必须先通过 E411 serial_read 门禁；默认不打开端口。
 * 禁止写/发字节；禁止任意端口字符串；波特率仅白名单。
 * 默认可注入 SerialReader（默认拒绝打开）；生产入口由 E425 注入 serialport 绑定。
 */

import { PARAMS } from '../config/params.js';
import type { HardwareGateDecision } from './hardware-capability.js';

/** 常见嵌入式波特率；禁止任意整数冒充。 */
export const SERIAL_BAUD_WHITELIST = Object.freeze([
  1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
] as const);

export type SerialBaudRate = (typeof SERIAL_BAUD_WHITELIST)[number];

/** 单次只读字节上界（实现护栏，防无限读）；超时仍用 [P-39]。 */
export const SERIAL_READ_MAX_BYTES_CAP = 65_536;

export interface SerialReaderResult {
  data: string;
  bytesRead: number;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
}

export type SerialReader = (request: {
  port: string;
  baudRate: SerialBaudRate;
  maxBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
}) => Promise<SerialReaderResult>;

export interface RunAuthorizedSerialReadInput {
  /** 必须已是 action=serial_read 且 allowed=true */
  gate: HardwareGateDecision;
  port: string;
  baudRate?: number;
  maxBytes?: number;
  reader?: SerialReader;
  signal?: AbortSignal;
}

export interface RunAuthorizedSerialReadResult {
  ok: boolean;
  serialReadExecuted: true;
  port: string;
  baudRate: SerialBaudRate;
  bytesRead: number;
  data: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  message: string;
}

const PORT_RE = /^(?:COM\d{1,3}|\/dev\/tty(?:USB|ACM|S)\d{1,3})$/i;

export function normalizeSerialPort(port: string): string {
  const value = port.trim();
  if (!PORT_RE.test(value)) {
    throw new Error(
      `串口名非法（仅允许 COMn 或 /dev/ttyUSB|ACM|Sn）：${port}`,
    );
  }
  // Windows COM 统一大写前缀，Unix 路径保持原样
  if (/^COM\d+/i.test(value)) return value.toUpperCase();
  return value;
}

export function normalizeSerialBaud(baud: number | undefined): SerialBaudRate {
  const value = baud ?? 115200;
  if (!(SERIAL_BAUD_WHITELIST as readonly number[]).includes(value)) {
    throw new Error(
      `波特率不在白名单：${value}；允许 ${SERIAL_BAUD_WHITELIST.join('/')}`,
    );
  }
  return value as SerialBaudRate;
}

export function normalizeSerialMaxBytes(maxBytes: number | undefined): number {
  const value = maxBytes ?? 4096;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('maxBytes 必须为正整数');
  }
  if (value > SERIAL_READ_MAX_BYTES_CAP) {
    throw new Error(`maxBytes 超过上界 ${SERIAL_READ_MAX_BYTES_CAP}`);
  }
  return value;
}

export async function runAuthorizedSerialRead(
  input: RunAuthorizedSerialReadInput,
): Promise<RunAuthorizedSerialReadResult> {
  if (!input.gate.allowed || input.gate.action !== 'serial_read') {
    throw new Error('串口驱动拒绝执行：硬件门禁未通过或非 serial_read 动作');
  }
  if (input.gate.audit.serialMode !== null && input.gate.audit.serialMode !== 'read_only') {
    throw new Error('串口驱动拒绝执行：仅允许 read_only');
  }

  const port = normalizeSerialPort(input.port);
  if (input.gate.audit.port && normalizeSerialPort(input.gate.audit.port) !== port) {
    throw new Error('串口与门禁记录不一致；拒绝打开');
  }
  const baudRate = normalizeSerialBaud(input.baudRate);
  const maxBytes = normalizeSerialMaxBytes(input.maxBytes);
  const timeoutMs = input.gate.timeoutMs > 0 ? input.gate.timeoutMs : PARAMS.flashTimeoutMs;
  const reader = input.reader ?? defaultSerialReader;
  const result = await reader({
    port,
    baudRate,
    maxBytes,
    timeoutMs,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const cancelled = result.cancelled === true;
  const ok = !result.timedOut && !cancelled;
  const preview = result.data.length > 200 ? `${result.data.slice(0, 200)}…` : result.data;
  return {
    ok,
    serialReadExecuted: true,
    port,
    baudRate,
    bytesRead: result.bytesRead,
    data: result.data,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    cancelled,
    message: ok
      ? `串口只读完成（${port}@${baudRate}，${result.bytesRead} 字节）${preview ? `：${preview}` : '。'}`
      : `串口只读未完成（${port}，timeout=${result.timedOut}，cancelled=${cancelled}）。`,
  };
}

/** 默认零硬件：不打开端口、不读字节；测试/生产须注入 SerialReader。 */
const defaultSerialReader: SerialReader = async () => {
  throw new Error(
    'E421 默认不打开真实串口；请注入 SerialReader（测试 mock 或 E425 createSerialportReader）',
  );
};
