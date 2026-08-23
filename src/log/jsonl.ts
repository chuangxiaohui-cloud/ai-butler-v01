/**
 * JSONL 追加工具（P15）
 * 文件句柄复用（免每事件 open-write-close）+ 内存字节计数 + 超 [P-113] 轮转保留一份
 * `.1` 归档，供 trajectory / usage / metrics 共用，避免长驻进程无界增长。
 * 读取带 mtime+size+解析函数三重键缓存，避免每次调用全量解析整文件。
 */

import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { PARAMS } from '../config/params.js';

interface OpenSink {
  fd: number;
  bytes: number; // 本进程累计写入字节（含换行）
}

const sinks = new Map<string, OpenSink>();

interface ReadCacheEntry<T> {
  key: string;
  parse: (line: string) => T | null;
  value: T[];
}

const readCache = new Map<string, ReadCacheEntry<unknown>>();

/** 追加一行 JSONL（自带换行）；超过 maxBytes 先轮转出 `.1` 归档再写 */
export function appendJsonl(
  filePath: string,
  line: string,
  maxBytes = PARAMS.jsonlMaxBytes, // [P-113]
): void {
  const sink = openSink(filePath);
  const data = `${line}\n`;
  const size = Buffer.byteLength(data);
  if (sink.bytes + size > maxBytes) rotate(filePath, sink);
  writeSync(sink.fd, data);
  sink.bytes += size;
}

/** 关闭句柄；不传路径则关闭全部（进程退出/测试清理用） */
export function closeJsonl(filePath?: string): void {
  if (filePath) {
    const sink = sinks.get(filePath);
    if (sink) {
      try {
        closeSync(sink.fd);
      } catch {
        // 已关闭则忽略
      }
      sinks.delete(filePath);
    }
    return;
  }
  for (const [path, sink] of sinks) {
    try {
      closeSync(sink.fd);
    } catch {
      // 已关闭则忽略
    }
    sinks.delete(path);
  }
}

/** 清空读缓存（测试隔离用） */
export function clearJsonlReadCache(): void {
  readCache.clear();
}

/**
 * 读取 JSONL 并逐行解析；mtime+size 任一变化即失效重读，否则复用缓存。
 * 文件缺失返回 [] 并清缓存。
 */
export function readJsonlCached<T>(filePath: string, parse: (line: string) => T | null): T[] {
  let stat: { mtimeMs: number; size: number } | null = null;
  try {
    const s = statSync(filePath);
    stat = { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    readCache.delete(filePath);
    return [];
  }
  const key = `${stat.mtimeMs}:${stat.size}`;
  const hit = readCache.get(filePath) as ReadCacheEntry<T> | undefined;
  if (hit && hit.key === key && hit.parse === parse) return hit.value;

  const value: T[] = [];
  for (const line of readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parse(line);
    if (parsed !== null) value.push(parsed);
  }
  readCache.set(filePath, { key, parse, value });
  return value;
}

function openSink(filePath: string): OpenSink {
  const existing = sinks.get(filePath);
  if (existing) return existing;
  mkdirSync(dirname(filePath), { recursive: true });
  let bytes = 0;
  try {
    bytes = statSync(filePath).size;
  } catch {
    bytes = 0; // 文件不存在按空处理
  }
  const fd = openSync(filePath, 'a');
  const sink: OpenSink = { fd, bytes };
  sinks.set(filePath, sink);
  return sink;
}

function rotate(filePath: string, sink: OpenSink): void {
  // 轮转：当前文件改名 `.1`（覆盖旧归档），句柄重开新文件
  try {
    closeSync(sink.fd);
  } catch {
    // 已关闭则忽略
  }
  try {
    renameSync(filePath, `${filePath}.1`);
  } catch {
    // 改名失败（文件被外部删除等）不阻塞写入
  }
  sink.fd = openSync(filePath, 'a');
  sink.bytes = 0;
}