import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { isPathAllowed } from './sandbox.js';
import { appendOperation } from './operation-log.js';

export interface ProjectFileChange {
  path: string;
  content: string;
}

export interface ProjectTransactionEntry {
  path: string;
  content: string;
  existed: boolean;
  originalSha256: string | null;
  proposedSha256: string;
  backupPath: string | null;
  tempPath: string;
}

export type ProjectTransactionConflictKind = 'modified' | 'deleted' | 'created';

export interface ProjectTransactionConflict {
  path: string;
  kind: ProjectTransactionConflictKind;
  existedAtSnapshot: boolean;
  existsNow: boolean;
  snapshotSha256: string | null;
  currentSha256: string | null;
  proposedSha256: string;
}

export type ProjectTransactionConflictChoice = 'keep_external' | 'use_transaction' | 'cancel_all';

export interface ProjectTransactionConflictOption {
  id: ProjectTransactionConflictChoice;
  label: string;
  description: string;
}

export interface ProjectTransactionConflictDecision {
  kind: 'project_transaction_conflict';
  transactionId: string;
  snapshotDir: string;
  conflicts: ProjectTransactionConflict[];
  options: ProjectTransactionConflictOption[];
  defaultChoice: 'cancel_all';
  requiresConfirmation: true;
}

export interface PreparedProjectTransaction {
  id: string;
  status: 'prepared';
  workspaceRoot: string;
  snapshotDir: string;
  manifestPath: string;
  entries: ProjectTransactionEntry[];
  audit?: ProjectTransactionAudit;
}

export interface ProjectTransactionAudit {
  userId: string;
  conversationId?: string;
  logPath?: string;
}

export type PrepareProjectTransactionResult =
  | { ok: true; transaction: PreparedProjectTransaction }
  | { ok: false; error: string };

export interface CommitProjectTransactionResult {
  ok: boolean;
  status: 'completed' | 'conflict' | 'stage_failed' | 'rolled_back' | 'rollback_failed';
  transactionId: string;
  snapshotDir: string;
  committedPaths: string[];
  pendingPaths: string[];
  rolledBackPaths?: string[];
  conflicts?: ProjectTransactionConflict[];
  decision?: ProjectTransactionConflictDecision;
  error?: string;
}

export interface CommitProjectTransactionOptions {
  writeTemp?: (path: string, content: string) => void;
  replaceFile?: (from: string, to: string) => void;
  restoreFile?: (from: string, to: string) => void;
  removeCreated?: (path: string) => void;
}

export interface CancelProjectTransactionResult {
  ok: boolean;
  status: 'cancelled' | 'cleanup_failed';
  transactionId: string;
  snapshotDir: string;
  error?: string;
}

export function prepareProjectTransaction(
  changes: ProjectFileChange[],
  opts: { workspaceRoot?: string; snapshotRoot?: string; audit?: ProjectTransactionAudit } = {},
): PrepareProjectTransactionResult {
  const workspaceRoot = resolve(opts.workspaceRoot ?? process.cwd());
  if (changes.length === 0) return { ok: false, error: '事务至少需要一个文件变更' };

  const validated: Array<{
    path: string;
    content: string;
    existed: boolean;
    originalSha256: string | null;
    proposedSha256: string;
  }> = [];
  const seen = new Set<string>();
  for (const change of changes) {
    if (!change || typeof change.path !== 'string' || !change.path.trim()) {
      return { ok: false, error: '文件路径不能为空' };
    }
    if (typeof change.content !== 'string') return { ok: false, error: `文件内容必须是字符串：${change.path}` };
    const check = isPathAllowed(change.path, workspaceRoot);
    if (!check.allowed || !check.resolved) {
      return { ok: false, error: check.reason ?? `路径不在沙箱内：${change.path}` };
    }
    const key = process.platform === 'win32' ? check.resolved.toLowerCase() : check.resolved;
    if (seen.has(key)) return { ok: false, error: `事务包含重复路径：${change.path}` };
    seen.add(key);
    const existed = existsSync(check.resolved);
    if (existed && !statSync(check.resolved).isFile()) {
      return { ok: false, error: `目标不是文件：${change.path}` };
    }
    validated.push({
      path: check.resolved,
      content: change.content,
      existed,
      originalSha256: existed ? sha256(readFileSync(check.resolved)) : null,
      proposedSha256: sha256(change.content),
    });
  }

  const id = randomUUID();
  const snapshotDir = join(resolve(opts.snapshotRoot ?? join(workspaceRoot, 'data', 'writer-transactions')), id);
  try {
    mkdirSync(snapshotDir, { recursive: true });
    const entries = validated.map((item, index): ProjectTransactionEntry => {
      const backupPath = item.existed ? join(snapshotDir, `${String(index).padStart(4, '0')}.bak`) : null;
      if (backupPath) {
        copyFileSync(item.path, backupPath);
        if (sha256(readFileSync(backupPath)) !== item.originalSha256) {
          throw new Error(`创建快照期间文件发生变化：${item.path}`);
        }
      }
      return {
        ...item,
        backupPath,
        tempPath: join(dirname(item.path), `.${basename(item.path)}.txn-${id}`),
      };
    });
    const manifestPath = join(snapshotDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      id,
      status: 'prepared',
      createdAt: Date.now(),
      entries: entries.map(({ path, existed, originalSha256, proposedSha256, backupPath }) => ({
        path,
        existed,
        originalSha256,
        proposedSha256,
        backupPath,
      })),
    }, null, 2), 'utf-8');
    if (opts.audit) {
      appendOperation({
        userId: opts.audit.userId,
        conversationId: opts.audit.conversationId,
        action: 'transaction',
        status: 'prepared',
        transactionId: id,
        snapshotDir,
        paths: entries.map((entry) => entry.path),
        path: workspaceRoot,
        backup: snapshotDir,
        created: false,
      }, opts.audit.logPath);
    }
    return {
      ok: true,
      transaction: {
        id,
        status: 'prepared',
        workspaceRoot,
        snapshotDir,
        manifestPath,
        entries,
        ...(opts.audit ? { audit: opts.audit } : {}),
      },
    };
  } catch (err) {
    rmSync(snapshotDir, { recursive: true, force: true });
    return { ok: false, error: `创建项目快照失败：${errorText(err)}` };
  }
}

export function commitProjectTransaction(
  transaction: PreparedProjectTransaction,
  opts: CommitProjectTransactionOptions = {},
): CommitProjectTransactionResult {
  const base = {
    transactionId: transaction.id,
    snapshotDir: transaction.snapshotDir,
  };
  const conflicts: ProjectTransactionConflict[] = [];
  for (const entry of transaction.entries) {
    const existsNow = existsSync(entry.path);
    const currentHash = existsNow && statSync(entry.path).isFile()
      ? sha256(readFileSync(entry.path))
      : null;
    if (existsNow !== entry.existed || currentHash !== entry.originalSha256) {
      conflicts.push({
        path: entry.path,
        kind: !entry.existed ? 'created' : !existsNow ? 'deleted' : 'modified',
        existedAtSnapshot: entry.existed,
        existsNow,
        snapshotSha256: entry.originalSha256,
        currentSha256: currentHash,
        proposedSha256: entry.proposedSha256,
      });
    }
  }
  if (conflicts.length > 0) {
    const error = `检测到 ${conflicts.length} 个文件自快照后发生变化`;
    auditTransaction(transaction, 'failed', error);
    return {
      ...base,
      ok: false,
      status: 'conflict',
      committedPaths: [],
      pendingPaths: transaction.entries.map((item) => item.path),
      conflicts,
      decision: buildProjectTransactionConflictDecision(transaction, conflicts),
      error,
    };
  }

  const staged: ProjectTransactionEntry[] = [];
  try {
    for (const entry of transaction.entries) {
      mkdirSync(dirname(entry.path), { recursive: true });
      if (opts.writeTemp) opts.writeTemp(entry.tempPath, entry.content);
      else writeFileSync(entry.tempPath, entry.content, 'utf-8');
      if (readFileSync(entry.tempPath, 'utf-8') !== entry.content) throw new Error(`暂存回读不一致：${entry.path}`);
      staged.push(entry);
    }
  } catch (err) {
    cleanupTemps(transaction.entries);
    auditTransaction(transaction, 'failed', errorText(err));
    return {
      ...base,
      ok: false,
      status: 'stage_failed',
      committedPaths: [],
      pendingPaths: transaction.entries.map((item) => item.path),
      error: errorText(err),
    };
  }

  const committedPaths: string[] = [];
  const touchedPaths: string[] = [];
  try {
    for (const entry of staged) {
      touchedPaths.push(entry.path);
      (opts.replaceFile ?? renameSync)(entry.tempPath, entry.path);
      committedPaths.push(entry.path);
    }
  } catch (err) {
    cleanupTemps(transaction.entries);
    const recovery = restoreTransactionPaths(transaction, touchedPaths, opts);
    const recoveryFailed = recovery.failedPaths.length > 0;
    auditTransaction(
      transaction,
      recoveryFailed ? 'failed' : 'rolled_back',
      recoveryFailed
        ? `${errorText(err)}；自动回滚失败：${recovery.failedPaths.join(', ')}`
        : errorText(err),
    );
    return {
      ...base,
      ok: false,
      status: recoveryFailed ? 'rollback_failed' : 'rolled_back',
      committedPaths: recovery.failedPaths,
      pendingPaths: transaction.entries.map((item) => item.path),
      rolledBackPaths: recovery.restoredPaths,
      error: recoveryFailed
        ? `${errorText(err)}；自动回滚失败：${recovery.failedPaths.join(', ')}`
        : `${errorText(err)}；已自动回滚`,
    };
  }

  auditTransaction(transaction, 'completed');
  return {
    ...base,
    ok: true,
    status: 'completed',
    committedPaths,
    pendingPaths: [],
  };
}

export function cancelPreparedProjectTransaction(
  transaction: PreparedProjectTransaction,
): CancelProjectTransactionResult {
  const base = { transactionId: transaction.id, snapshotDir: transaction.snapshotDir };
  try {
    if (dirname(transaction.manifestPath) !== transaction.snapshotDir || basename(transaction.snapshotDir) !== transaction.id) {
      throw new Error('事务快照身份不匹配');
    }
    if (existsSync(transaction.manifestPath)) {
      const manifest = JSON.parse(readFileSync(transaction.manifestPath, 'utf-8')) as { id?: unknown };
      if (manifest.id !== transaction.id) throw new Error('事务清单身份不匹配');
    }
    rmSync(transaction.snapshotDir, { recursive: true, force: true });
    auditTransaction(transaction, 'cancelled');
    return { ...base, ok: true, status: 'cancelled' };
  } catch (err) {
    const error = errorText(err);
    auditTransaction(transaction, 'failed', error);
    return { ...base, ok: false, status: 'cleanup_failed', error };
  }
}

export function buildProjectTransactionConflictDecision(
  transaction: PreparedProjectTransaction,
  conflicts: ProjectTransactionConflict[],
): ProjectTransactionConflictDecision {
  return {
    kind: 'project_transaction_conflict',
    transactionId: transaction.id,
    snapshotDir: transaction.snapshotDir,
    conflicts,
    options: [
      {
        id: 'keep_external',
        label: '保留外部版本',
        description: '保留当前文件，放弃事务中的冲突变更。',
      },
      {
        id: 'use_transaction',
        label: '使用事务版本',
        description: '以事务暂存内容覆盖当前文件。',
      },
      {
        id: 'cancel_all',
        label: '取消整批',
        description: '不写入任何文件，保留当前项目状态。',
      },
    ],
    defaultChoice: 'cancel_all',
    requiresConfirmation: true,
  };
}

function restoreTransactionPaths(
  transaction: PreparedProjectTransaction,
  touchedPaths: string[],
  opts: { restoreFile?: (from: string, to: string) => void; removeCreated?: (path: string) => void },
): { restoredPaths: string[]; failedPaths: string[] } {
  const restoredPaths: string[] = [];
  const failedPaths: string[] = [];
  const touched = new Set(touchedPaths);
  for (const entry of [...transaction.entries].reverse()) {
    if (!touched.has(entry.path)) continue;
    try {
      if (entry.existed) {
        if (!entry.backupPath || !existsSync(entry.backupPath)) throw new Error('事务快照缺失');
        mkdirSync(dirname(entry.path), { recursive: true });
        if (opts.restoreFile) opts.restoreFile(entry.backupPath, entry.path);
        else copyFileSync(entry.backupPath, entry.path);
        if (sha256(readFileSync(entry.path)) !== entry.originalSha256) throw new Error('回滚校验不一致');
      } else {
        if (opts.removeCreated) opts.removeCreated(entry.path);
        else rmSync(entry.path, { force: true });
        if (existsSync(entry.path)) throw new Error('新建文件回滚后仍存在');
      }
      restoredPaths.push(entry.path);
    } catch {
      failedPaths.push(entry.path);
    }
  }
  return { restoredPaths, failedPaths };
}

function auditTransaction(
  transaction: PreparedProjectTransaction,
  status: 'completed' | 'cancelled' | 'rolled_back' | 'failed',
  error?: string,
): void {
  if (!transaction.audit) return;
  try {
    appendOperation({
      userId: transaction.audit.userId,
      conversationId: transaction.audit.conversationId,
      action: 'transaction',
      status,
      transactionId: transaction.id,
      snapshotDir: transaction.snapshotDir,
      paths: transaction.entries.map((entry) => entry.path),
      path: transaction.workspaceRoot,
      backup: transaction.snapshotDir,
      created: false,
      error,
    }, transaction.audit.logPath);
  } catch {
    // 文件结果优先；审计失败不能改变已完成的提交或回滚结论。
  }
}

function cleanupTemps(entries: ProjectTransactionEntry[]): void {
  for (const entry of entries) {
    try {
      rmSync(entry.tempPath, { force: true });
    } catch {
      // 清理失败不覆盖原始事务结果；快照仍保留供后续恢复。
    }
  }
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
