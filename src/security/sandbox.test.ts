import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { isPathAllowed, logSandboxAudit } from './sandbox.js';

test('sandbox: 白名单根目录内放行', () => {
  const root = 'M:\\workspace';
  assert.equal(isPathAllowed('projects/app/main.c', root).allowed, true);
  assert.equal(isPathAllowed('sandbox/tmp.out', root).allowed, true);
  assert.equal(isPathAllowed('outputs/report.pdf', root).allowed, true);
});

test('sandbox: 越界路径拒绝', () => {
  const root = 'M:\\workspace';
  assert.equal(isPathAllowed('C:\\Windows\\system32\\test.txt', root).allowed, false);
  assert.equal(isPathAllowed('~/.ssh/id_rsa', root).allowed, false);
  assert.equal(isPathAllowed('../outside.txt', root).allowed, false);
});

test('sandbox: 越界写入审计日志', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-test-'));
  const logPath = join(dir, 'audit.jsonl');
  try {
    const check = isPathAllowed('C:\\Windows\\system32\\test.txt', dir);
    assert.equal(check.allowed, false);
    logSandboxAudit(
      {
        requestedPath: 'C:\\Windows\\system32\\test.txt',
        allowed: false,
        reason: check.reason,
        ts: '2026-08-12T00:00:00Z',
      },
      logPath,
    );
    const line = readFileSync(logPath, 'utf-8').trim();
    const entry = JSON.parse(line) as { allowed: boolean; reason?: string };
    assert.equal(entry.allowed, false);
    assert.ok(entry.reason?.includes('越界'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// SEV-1.2 新增覆盖
test('sandbox: symlink 逃逸到白名单外必须拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-symlink-'));
  try {
    const inside = join(dir, 'projects', 'app.c');
    const outside = join(dir, 'secrets.txt');
    writeFileSync(outside, 'top secret', 'utf-8');
    mkdirSync(join(dir, 'projects'), { recursive: true });
    // 在白名单内放一个指向外部的 symlink
    symlinkSync(outside, inside, 'file');
    const check = isPathAllowed('projects/app.c', dir);
    assert.equal(check.allowed, false, 'symlink 指向白名单外必须被拒绝');
    assert.ok(check.reason?.includes('越界'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sandbox: NUL byte 与空路径直接拒绝', () => {
  const root = 'M:\\workspace';
  assert.equal(isPathAllowed('', root).allowed, false);
  assert.equal(isPathAllowed('projects/\x00/etc/passwd', root).allowed, false);
  assert.equal(isPathAllowed('projects/\x07bell', root).allowed, false);
});

test('sandbox: 不存在的子路径按父目录判定', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-newpath-'));
  try {
    const check = isPathAllowed('projects/never-created/file.txt', dir);
    assert.equal(check.allowed, true);
    const bad = isPathAllowed('sibling-of-root/file.txt', dir);
    assert.equal(bad.allowed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sandbox: SANDBOX_ALLOWED_DIRS 越出 workspaceRoot 必须拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sandbox-extras-'));
  try {
    const previous = process.env.SANDBOX_ALLOWED_DIRS;
    // 注入一个指向 workspaceRoot 之外的目录
    process.env.SANDBOX_ALLOWED_DIRS = 'C:\\Windows\\Temp';
    try {
      const check = isPathAllowed('C:\\Windows\\Temp\\evil.txt', dir);
      assert.equal(check.allowed, false, 'workspaceRoot 外的 extra root 不应放行');
    } finally {
      if (previous === undefined) delete process.env.SANDBOX_ALLOWED_DIRS;
      else process.env.SANDBOX_ALLOWED_DIRS = previous;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});