import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { commitProjectTransaction, prepareProjectTransaction } from './project-transaction.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'project-transaction-'));
  const first = join(root, 'projects', 'demo', 'a.txt');
  const second = join(root, 'projects', 'demo', 'b.txt');
  mkdirSync(dirname(first), { recursive: true });
  writeFileSync(first, 'old-a', 'utf-8');
  writeFileSync(second, 'old-b', 'utf-8');
  return { root, first, second, snapshotRoot: join(root, 'data', 'writer-transactions') };
}

test('project-transaction: 两文件全量暂存后提交并保留项目快照', () => {
  const { root, first, second, snapshotRoot } = fixture();
  const logPath = join(root, 'operations.jsonl');
  try {
    rmSync(second);
    const prepared = prepareProjectTransaction([
      { path: first, content: 'new-a' },
      { path: second, content: 'new-b' },
    ], { workspaceRoot: root, snapshotRoot, audit: { userId: 'u1', logPath } });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.equal(readFileSync(first, 'utf-8'), 'old-a', 'prepare 不得触碰目标文件');
    assert.equal(existsSync(second), false);
    assert.ok(existsSync(prepared.transaction.manifestPath));
    assert.ok(prepared.transaction.entries[0]?.backupPath);
    assert.ok(existsSync(prepared.transaction.entries[0]!.backupPath!));
    assert.equal(prepared.transaction.entries[1]?.backupPath, null);
    assert.equal(prepared.transaction.entries[1]?.existed, false);

    const result = commitProjectTransaction(prepared.transaction);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.committedPaths, [first, second]);
    assert.equal(readFileSync(first, 'utf-8'), 'new-a');
    assert.equal(readFileSync(second, 'utf-8'), 'new-b');
    assert.equal(hasTempFiles(dirname(first)), false);
    assert.deepEqual(transactionStatuses(logPath), ['prepared', 'completed']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project-transaction: 越界或重复路径使整批预检失败且不创建快照', () => {
  const { root, first, snapshotRoot } = fixture();
  try {
    const outside = prepareProjectTransaction([
      { path: first, content: 'new-a' },
      { path: join(root, 'outside.txt'), content: 'bad' },
    ], { workspaceRoot: root, snapshotRoot });
    assert.equal(outside.ok, false);
    assert.match(outside.ok ? '' : outside.error, /越界/);
    assert.equal(existsSync(snapshotRoot), false);
    assert.equal(readFileSync(first, 'utf-8'), 'old-a');

    const duplicate = prepareProjectTransaction([
      { path: first, content: 'one' },
      { path: first, content: 'two' },
    ], { workspaceRoot: root, snapshotRoot });
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.ok ? '' : duplicate.error, /重复路径/);
    assert.equal(existsSync(snapshotRoot), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project-transaction: 暂存失败时目标文件零写入并清理全部临时文件', () => {
  const { root, first, second, snapshotRoot } = fixture();
  try {
    const prepared = prepareProjectTransaction([
      { path: first, content: 'new-a' },
      { path: second, content: 'new-b' },
    ], { workspaceRoot: root, snapshotRoot });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    let writes = 0;
    const result = commitProjectTransaction(prepared.transaction, {
      writeTemp: (path, content) => {
        writes += 1;
        if (writes === 2) throw new Error('disk full');
        writeFileSync(path, content, 'utf-8');
      },
    });
    assert.equal(result.status, 'stage_failed');
    assert.deepEqual(result.committedPaths, []);
    assert.equal(readFileSync(first, 'utf-8'), 'old-a');
    assert.equal(readFileSync(second, 'utf-8'), 'old-b');
    assert.equal(hasTempFiles(dirname(first)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project-transaction: 汇总全部冲突并返回只读仲裁契约且整批不提交', () => {
  const { root, first, second, snapshotRoot } = fixture();
  const created = join(root, 'projects', 'demo', 'created.txt');
  const logPath = join(root, 'operations.jsonl');
  try {
    const prepared = prepareProjectTransaction([
      { path: first, content: 'new-a' },
      { path: second, content: 'new-b' },
      { path: created, content: 'new-created' },
    ], { workspaceRoot: root, snapshotRoot, audit: { userId: 'u1', logPath } });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    writeFileSync(first, 'external-change', 'utf-8');
    rmSync(second);
    writeFileSync(created, 'external-created', 'utf-8');
    const result = commitProjectTransaction(prepared.transaction);
    assert.equal(result.status, 'conflict');
    assert.deepEqual(result.committedPaths, []);
    assert.equal(result.conflicts?.length, 3);
    assert.deepEqual(result.conflicts?.map((item) => item.kind), ['modified', 'deleted', 'created']);
    assert.equal(result.conflicts?.[0]?.existedAtSnapshot, true);
    assert.equal(result.conflicts?.[0]?.existsNow, true);
    assert.match(result.conflicts?.[0]?.snapshotSha256 ?? '', /^[a-f0-9]{64}$/);
    assert.match(result.conflicts?.[0]?.currentSha256 ?? '', /^[a-f0-9]{64}$/);
    assert.match(result.conflicts?.[0]?.proposedSha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(result.conflicts?.[1]?.currentSha256, null);
    assert.equal(result.conflicts?.[2]?.snapshotSha256, null);
    assert.deepEqual(result.decision?.options.map((option) => option.id), [
      'keep_external',
      'use_transaction',
      'cancel_all',
    ]);
    assert.equal(result.decision?.defaultChoice, 'cancel_all');
    assert.equal(result.decision?.requiresConfirmation, true);
    assert.equal(readFileSync(first, 'utf-8'), 'external-change');
    assert.equal(existsSync(second), false);
    assert.equal(readFileSync(created, 'utf-8'), 'external-created');
    assert.doesNotMatch(readFileSync(logPath, 'utf-8'), /new-a|new-b|new-created/);
    assert.deepEqual(transactionStatuses(logPath), ['prepared', 'failed']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project-transaction: 提交中断自动恢复已提交文件并记录 rolled_back', () => {
  const { root, first, second, snapshotRoot } = fixture();
  const logPath = join(root, 'operations.jsonl');
  try {
    const prepared = prepareProjectTransaction([
      { path: first, content: 'new-a' },
      { path: second, content: 'new-b' },
    ], { workspaceRoot: root, snapshotRoot, audit: { userId: 'u1', logPath } });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    let replaces = 0;
    const result = commitProjectTransaction(prepared.transaction, {
      replaceFile: (from, to) => {
        replaces += 1;
        if (replaces === 2) throw new Error('replace failed');
        renameSync(from, to);
      },
    });
    assert.equal(result.status, 'rolled_back');
    assert.deepEqual(result.committedPaths, []);
    assert.ok(result.rolledBackPaths?.includes(first));
    assert.equal(readFileSync(first, 'utf-8'), 'old-a');
    assert.equal(readFileSync(second, 'utf-8'), 'old-b');
    assert.ok(existsSync(prepared.transaction.snapshotDir));
    assert.equal(hasTempFiles(dirname(first)), false);
    assert.deepEqual(transactionStatuses(logPath), ['prepared', 'rolled_back']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project-transaction: 自动回滚删除已提交的新建文件', () => {
  const { root, first, second, snapshotRoot } = fixture();
  const created = join(root, 'projects', 'demo', 'new.txt');
  try {
    const prepared = prepareProjectTransaction([
      { path: created, content: 'created' },
      { path: first, content: 'new-a' },
      { path: second, content: 'new-b' },
    ], { workspaceRoot: root, snapshotRoot });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    let replaces = 0;
    const result = commitProjectTransaction(prepared.transaction, {
      replaceFile: (from, to) => {
        replaces += 1;
        if (replaces === 3) throw new Error('replace failed');
        renameSync(from, to);
      },
    });
    assert.equal(result.status, 'rolled_back');
    assert.equal(existsSync(created), false);
    assert.equal(readFileSync(first, 'utf-8'), 'old-a');
    assert.equal(readFileSync(second, 'utf-8'), 'old-b');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project-transaction: 自动恢复失败返回 rollback_failed 与未恢复路径', () => {
  const { root, first, second, snapshotRoot } = fixture();
  try {
    const prepared = prepareProjectTransaction([
      { path: first, content: 'new-a' },
      { path: second, content: 'new-b' },
    ], { workspaceRoot: root, snapshotRoot });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    let replaces = 0;
    const result = commitProjectTransaction(prepared.transaction, {
      replaceFile: (from, to) => {
        replaces += 1;
        if (replaces === 2) throw new Error('replace failed');
        renameSync(from, to);
      },
      restoreFile: () => { throw new Error('restore failed'); },
    });
    assert.equal(result.status, 'rollback_failed');
    assert.ok(result.committedPaths.includes(first));
    assert.match(result.error ?? '', /自动回滚失败/);
    assert.ok(existsSync(prepared.transaction.snapshotDir));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function hasTempFiles(dir: string): boolean {
  return readdirSync(dir).some((name) => name.includes('.txn-'));
}

function transactionStatuses(logPath: string): string[] {
  return readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { action: string; status?: string })
    .filter((entry) => entry.action === 'transaction')
    .map((entry) => entry.status ?? '');
}
