import { strict as assert } from 'node:assert';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  appendOperation,
  latestWriteOperation,
  rollbackLatest,
} from './operation-log.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'operation-log-test-'));
}

test('operation-log: append/latest 按用户过滤', () => {
  const dir = tempDir();
  const logPath = join(dir, 'operations.jsonl');
  try {
    appendOperation(
      { userId: 'u1', action: 'write', path: 'a.c', backup: null, created: true },
      logPath,
    );
    appendOperation(
      { userId: 'u2', action: 'write', path: 'b.c', backup: null, created: true },
      logPath,
    );
    appendOperation(
      { userId: 'u1', conversationId: 'conv1', action: 'write', path: 'c.c', backup: null, created: true },
      logPath,
    );
    assert.equal(latestWriteOperation('u1', { logPath })?.path, 'c.c');
    assert.equal(latestWriteOperation('u1', { logPath, conversationId: 'conv1' })?.path, 'c.c');
    assert.equal(latestWriteOperation('u1', { logPath, conversationId: 'conv2' }), null);
    assert.equal(latestWriteOperation('u2', { logPath })?.path, 'b.c');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('operation-log: 覆盖文件回滚恢复备份', () => {
  const dir = tempDir();
  const logPath = join(dir, 'operations.jsonl');
  const target = join(dir, 'src', 'main.c');
  const backup = join(dir, 'backups', 'main.c.bak');
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'backups'), { recursive: true });
  writeFileSync(target, 'new', 'utf-8');
  writeFileSync(backup, 'old', 'utf-8');
  appendOperation(
    {
      userId: 'u1',
      action: 'write',
      path: target,
      backup,
      created: false,
    },
    logPath,
  );
  try {
    const old = process.env.SANDBOX_ALLOWED_DIRS;
    process.env.SANDBOX_ALLOWED_DIRS = dir;
    try {
      const r = rollbackLatest('u1', { logPath, cwd: dir });
      assert.equal(r.ok, true);
      assert.equal(readFileSync(target, 'utf-8'), 'old');
      assert.ok(r.message.includes('已回滚'));
    } finally {
      process.env.SANDBOX_ALLOWED_DIRS = old;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('operation-log: 新建文件回滚删除文件', () => {
  const dir = tempDir();
  const logPath = join(dir, 'operations.jsonl');
  const target = join(dir, 'src', 'adc.c');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(target, 'int main(void){return 0;}', 'utf-8');
  appendOperation(
    {
      userId: 'u1',
      action: 'write',
      path: target,
      backup: null,
      created: true,
    },
    logPath,
  );
  try {
    const old = process.env.SANDBOX_ALLOWED_DIRS;
    process.env.SANDBOX_ALLOWED_DIRS = dir;
    try {
      const r = rollbackLatest('u1', { logPath, cwd: dir });
      assert.equal(r.ok, true);
      assert.equal(existsSync(target), false);
      assert.ok(r.message.includes('删除新建文件'));
    } finally {
      process.env.SANDBOX_ALLOWED_DIRS = old;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('operation-log: 无记录时诚实说明', () => {
  const dir = tempDir();
  const logPath = join(dir, 'operations.jsonl');
  try {
    const r = rollbackLatest('u1', { logPath, cwd: dir });
    assert.equal(r.ok, false);
    assert.ok(r.message.includes('没有找到最近由我执行的写入操作'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
