/**
 * E425：serialport 只读绑定单测（注入 mock 模块，零真实硬件、零原生编译）。
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { createSerialportReader, type SerialPortInstance, type SerialPortModule } from './serialport-reader.js';

class MockSerialPort extends EventEmitter implements SerialPortInstance {
  writeCalls = 0;
  opened = false;
  closed = false;

  constructor(public readonly options: { path: string; baudRate: number; autoOpen?: boolean }) {
    super();
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  write(_data: Buffer | string, _cb?: (err?: Error | null) => void): boolean {
    this.writeCalls += 1;
    return true;
  }

  emitData(text: string): void {
    this.emit('data', Buffer.from(text, 'utf8'));
  }
}

function mockModule(onCreate?: (port: MockSerialPort) => void): SerialPortModule {
  return {
    SerialPort: class extends MockSerialPort {
      constructor(options: { path: string; baudRate: number; autoOpen?: boolean }) {
        super(options);
        onCreate?.(this);
      }
    } as unknown as SerialPortModule['SerialPort'],
  };
}

/** 下一 macrotask 再发数据，保证 open 与 listener 已挂上 */
function defer(fn: () => void): void {
  setTimeout(fn, 0);
}

test('E425: mock serialport 只读累计字节且不调用 write', async () => {
  let created: MockSerialPort | undefined;
  const reader = createSerialportReader({
    loadModule: async () =>
      mockModule((port) => {
        created = port;
        defer(() => {
          port.emitData('hello ');
          port.emitData('uart');
        });
      }),
  });

  const result = await reader({
    port: 'COM3',
    baudRate: 115200,
    maxBytes: 64,
    timeoutMs: 500,
  });

  assert.equal(result.data, 'hello uart');
  assert.equal(result.bytesRead, 10);
  assert.equal(result.timedOut, false);
  assert.equal(result.cancelled, false);
  assert.ok(created?.opened);
  assert.ok(created?.closed);
  assert.equal(created?.writeCalls, 0);
  assert.equal(created?.options.path, 'COM3');
  assert.equal(created?.options.baudRate, 115200);
  assert.equal(created?.options.autoOpen, false);
});

test('E425: 达到 maxBytes 即停；超时标记 timedOut', async () => {
  const readerCap = createSerialportReader({
    loadModule: async () =>
      mockModule((port) => {
        defer(() => {
          port.emitData('ABCDEFGHIJ');
        });
      }),
  });
  const capped = await readerCap({
    port: 'COM4',
    baudRate: 9600,
    maxBytes: 4,
    timeoutMs: 500,
  });
  assert.equal(capped.data, 'ABCD');
  assert.equal(capped.bytesRead, 4);

  const readerTimeout = createSerialportReader({
    loadModule: async () => mockModule(),
  });
  const timed = await readerTimeout({
    port: 'COM5',
    baudRate: 115200,
    maxBytes: 16,
    timeoutMs: 30,
  });
  assert.equal(timed.timedOut, true);
  assert.equal(timed.bytesRead, 0);
});

test('E425: AbortSignal 取消；加载失败明确报错', async () => {
  const ac = new AbortController();
  const reader = createSerialportReader({
    loadModule: async () =>
      mockModule(() => {
        defer(() => ac.abort());
      }),
  });
  const cancelled = await reader({
    port: 'COM6',
    baudRate: 115200,
    maxBytes: 32,
    timeoutMs: 500,
    signal: ac.signal,
  });
  assert.equal(cancelled.cancelled, true);

  const missing = createSerialportReader({
    loadModule: async () => {
      throw new Error('Cannot find package serialport');
    },
  });
  await assert.rejects(
    () =>
      missing({
        port: 'COM7',
        baudRate: 115200,
        maxBytes: 8,
        timeoutMs: 100,
      }),
    /Cannot find package serialport|E425 未加载 serialport/,
  );
});
