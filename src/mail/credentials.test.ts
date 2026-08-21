import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  loadCredentials,
  saveCredentials,
  validateCredentials,
  type SmtpCredentials,
} from './credentials.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'mail-cred-test-'));
}

const CREDS: SmtpCredentials = {
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  user: 'you@qq.com',
  pass: '授权码',
  from: 'you@qq.com',
};

test('credentials: save → load 往返，密码不丢失', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'mail-credentials.json');
    saveCredentials(CREDS, path);
    const loaded = loadCredentials(path);
    assert.ok(loaded);
    assert.equal(loaded.host, 'smtp.qq.com');
    assert.equal(loaded.port, 465);
    assert.equal(loaded.secure, true);
    assert.equal(loaded.pass, '授权码');
    assert.equal(loaded.from, 'you@qq.com');
    const raw = readFileSync(path, 'utf-8');
    assert.ok(raw.includes('授权码'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('credentials: 文件不存在返回 null，不抛错', () => {
  const dir = tempDir();
  try {
    assert.equal(loadCredentials(join(dir, 'missing.json')), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('credentials: 校验缺字段与非法端口', () => {
  assert.deepEqual(validateCredentials({}), ['host', 'port', 'user', 'pass', 'from']);
  assert.deepEqual(
    validateCredentials({ host: 'h', port: 0, user: 'u', pass: 'p', from: 'bad' }),
    ['port', 'from'],
  );
  assert.deepEqual(validateCredentials(CREDS), []);
});

test('credentials: 文件损坏返回 null', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'mail-credentials.json');
    saveCredentials(CREDS, path);
    // 破坏字段后应视为未配置
    writeFileSync(path, JSON.stringify({ host: 'h' }), 'utf-8');
    assert.equal(loadCredentials(path), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

