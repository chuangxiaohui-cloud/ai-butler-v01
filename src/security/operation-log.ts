/**
 * Agent 文件操作日志：project-writer 写入时登记，
 * “撤销/回滚”指令按最近一次操作恢复备份或删除新建文件。
 */

import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { isPathAllowed } from './sandbox.js';

export interface OperationRecord {
  id: string;
  userId: string;
  conversationId?: string;
  action: 'write' | 'rollback';
  path: string;
  backup: string | null;
  created: boolean;
  timestamp: number;
}

export type OperationInput = Omit<OperationRecord, 'id' | 'timestamp'>;

const ROLLBACK_RE =
  /(?:撤销|回滚)(?:刚才|最近|上一步|最后一次)?(?:的)?(?:操作|写入|修改|动作)|恢复刚才/;

export function isRollbackQuery(query: string): boolean {
  return ROLLBACK_RE.test(query);
}

export function operationLogPath(): string {
  return (
    process.env.OPERATIONS_LOG_PATH ??
    join(process.cwd(), 'data', 'operations.jsonl')
  );
}

export function appendOperation(
  input: OperationInput,
  logPath = operationLogPath(),
): string {
  const record: OperationRecord = {
    ...input,
    id: randomUUID(),
    timestamp: Date.now(),
  };
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf-8');
  return record.id;
}

export function latestWriteOperation(
  userId?: string,
  opts: { conversationId?: string; logPath?: string } = {},
): OperationRecord | null {
  const logPath = opts.logPath ?? operationLogPath();
  const conversationId = opts.conversationId;
  if (!existsSync(logPath)) return null;
  const lines = readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const record = JSON.parse(lines[i]) as OperationRecord;
      if (record.action !== 'write') continue;
      if (userId && record.userId !== userId) continue;
      if (conversationId && record.conversationId !== conversationId) continue;
      return record;
    } catch {
      // 损坏行跳过，不阻塞回滚
    }
  }
  return null;
}

export interface RollbackResult {
  ok: boolean;
  message: string;
  restoredPath?: string;
}

export function rollbackLatest(
  userId?: string,
  opts: { conversationId?: string; logPath?: string; cwd?: string } = {},
): RollbackResult {
  const operation = latestWriteOperation(
    userId,
    { conversationId: opts.conversationId, logPath: opts.logPath },
  );
  if (!operation) {
    return {
      ok: false,
      message:
        '没有找到最近由我执行的写入操作记录，无法自动回滚。' +
        '如果你指的是编辑器里的改动，可以先试试 Ctrl+Z；' +
        '之后我写入文件时会先备份，并支持“撤销刚才的操作”自动恢复。',
    };
  }

  const cwd = opts.cwd ?? process.cwd();
  const check = isPathAllowed(operation.path, cwd);
  if (!check.allowed || !check.resolved) {
    return {
      ok: false,
      message: `回滚路径不在沙箱白名单内，已拒绝：${operation.path}`,
    };
  }

  try {
    if (operation.backup && existsSync(operation.backup)) {
      mkdirSync(dirname(operation.path), { recursive: true });
      copyFileSync(operation.backup, operation.path);
      return {
        ok: true,
        message: `已回滚：${operation.path}（恢复自备份）`,
        restoredPath: operation.path,
      };
    }
    if (operation.created) {
      rmSync(operation.path, { force: true });
      return {
        ok: true,
        message: `已回滚：删除新建文件 ${operation.path}`,
        restoredPath: operation.path,
      };
    }
    return {
      ok: false,
      message: `最近写入操作缺少备份且不是新建文件，无法回滚：${operation.path}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `回滚失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
