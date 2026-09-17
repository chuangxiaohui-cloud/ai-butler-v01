/**
 * E425：生产侧 serialport 只读绑定。
 * 动态加载 optionalDependency；本 reader 路径禁止 write/发字节。
 */

import type { SerialReader, SerialReaderResult } from './serial-driver.js';

/** 最小串口实例契约（可注入 mock，避免单测依赖原生绑定）。 */
export interface SerialPortInstance {
  open(): Promise<void>;
  close(): Promise<void>;
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  /** 真实库有 write；生产 reader 不得调用。 */
  write?: (data: Buffer | string, callback?: (err?: Error | null) => void) => boolean;
}

export interface SerialPortModule {
  SerialPort: new (options: {
    path: string;
    baudRate: number;
    autoOpen?: boolean;
  }) => SerialPortInstance;
}

export type LoadSerialPortModule = () => Promise<SerialPortModule>;

async function defaultLoadSerialPortModule(): Promise<SerialPortModule> {
  try {
    // 可选依赖：未安装时动态 import 失败并转为明确错误
    const mod = await import('serialport');
    const SerialPort = (mod as { SerialPort?: SerialPortModule['SerialPort'] }).SerialPort;
    if (typeof SerialPort !== 'function') {
      throw new Error('模块缺少 SerialPort 导出');
    }
    return { SerialPort };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `E425 未加载 serialport 可选依赖（${reason}）。生产机请执行：npm i serialport`,
    );
  }
}

export interface CreateSerialportReaderOptions {
  /** 单测注入；缺省动态加载 serialport */
  loadModule?: LoadSerialPortModule;
}

/**
 * 创建只读 SerialReader：打开 → 累计至 maxBytes/超时/取消 → 关闭。
 * 不调用 write；加载失败时在执行时抛出明确错误。
 */
export function createSerialportReader(
  options: CreateSerialportReaderOptions = {},
): SerialReader {
  const loadModule = options.loadModule ?? defaultLoadSerialPortModule;
  return async (request): Promise<SerialReaderResult> => {
    const started = Date.now();
    if (request.signal?.aborted) {
      return {
        data: '',
        bytesRead: 0,
        durationMs: 0,
        timedOut: false,
        cancelled: true,
      };
    }

    const { SerialPort } = await loadModule();
    const port = new SerialPort({
      path: request.port,
      baudRate: request.baudRate,
      autoOpen: false,
    });

    const chunks: Buffer[] = [];
    let bytesRead = 0;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    const cleanupListeners = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort && request.signal) {
        request.signal.removeEventListener('abort', onAbort);
      }
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (err?: Error): void => {
          if (settled) return;
          settled = true;
          cleanupListeners();
          if (err) reject(err);
          else resolve();
        };

        port.on('data', (chunk: Buffer) => {
          if (settled) return;
          const remain = request.maxBytes - bytesRead;
          if (remain <= 0) {
            finish();
            return;
          }
          const piece = chunk.length > remain ? chunk.subarray(0, remain) : chunk;
          chunks.push(Buffer.from(piece));
          bytesRead += piece.length;
          if (bytesRead >= request.maxBytes) finish();
        });

        port.on('error', (err: Error) => {
          finish(err);
        });

        timer = setTimeout(() => {
          // 有数据则视为读窗结束成功；零字节才算真正超时失败（对齐 E421 ok=!timedOut）
          if (bytesRead === 0) timedOut = true;
          finish();
        }, request.timeoutMs);

        if (request.signal) {
          onAbort = (): void => {
            cancelled = true;
            finish();
          };
          request.signal.addEventListener('abort', onAbort, { once: true });
        }

        void port.open().then(() => {
          // 打开后若已达上限（极端空读后立刻 abort）由其它路径 finish
        }, (err: unknown) => {
          finish(err instanceof Error ? err : new Error(String(err)));
        });
      });
    } finally {
      cleanupListeners();
      try {
        await port.close();
      } catch {
        // 关闭失败不掩盖已读结果；下次打开由 OS/驱动报错
      }
    }

    const data = Buffer.concat(chunks).toString('utf8');
    return {
      data,
      bytesRead,
      durationMs: Date.now() - started,
      timedOut,
      cancelled,
    };
  };
}
