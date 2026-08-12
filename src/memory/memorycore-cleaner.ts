/**
 * MemoryCore L0 清理（v0.2b delete 缺口 workaround）
 * MemoryCore 的 deleteL0BySession 只删空 SQLite 表，未删 conversations/*.jsonl；
 * 本模块直接按 session 过滤 JSONL 文件，先备份再写回。
 */

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_BASE_DIR = join(homedir(), '.memory-tencentdb', 'memory-tdai');

export interface ClearSessionResult {
  deleted: number;
  files: string[];
}

export function clearSessionL0(
  sessionId: string,
  baseDir = DEFAULT_BASE_DIR,
): ClearSessionResult {
  const convDir = join(baseDir, 'conversations');
  let deleted = 0;
  const files: string[] = [];
  for (const name of readdirSync(convDir).filter((f) => f.endsWith('.jsonl'))) {
    const path = join(convDir, name);
    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
    const kept: string[] = [];
    let removedInFile = 0;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as { sessionId?: string; sessionKey?: string };
        if (obj.sessionId === sessionId || obj.sessionKey === sessionId) {
          removedInFile += 1;
          continue;
        }
      } catch {
        // 损坏行保留原样
      }
      kept.push(line);
    }
    if (removedInFile === 0) continue;
    const backupDir = join(convDir, '.bak');
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(path, join(backupDir, `${Date.now()}-${name}`));
    writeFileSync(path, `${kept.join('\n')}${kept.length > 0 ? '\n' : ''}`, 'utf-8');
    deleted += removedInFile;
    files.push(name);
  }
  return { deleted, files };
}
