import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  listAccountSummaries,
  loadCredentials,
  loadCredentialsStore,
  saveCredentials,
  setActiveAccount,
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

test('credentials: 多账号容器——saveCredentials 带 accountKey 建账号并置 active，loadCredentials 返回 active（E302）', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'mail-credentials.json');
    saveCredentials({ ...CREDS, from: 'a@qq.com', user: 'a@qq.com' }, path, 'qq');
    saveCredentials(
      { ...CREDS, host: 'smtp.outlook.com', from: 'b@outlook.com', user: 'b@outlook.com' },
      path,
      'outlook',
    );
    // 最后保存的 outlook 为 active
    assert.equal(loadCredentials(path)?.from, 'b@outlook.com');
    // 切回 qq
    assert.equal(setActiveAccount('qq', path), true);
    assert.equal(loadCredentials(path)?.from, 'a@qq.com');
    const store = loadCredentialsStore(path);
    assert.ok(store);
    assert.equal(store.active, 'qq');
    assert.deepEqual(Object.keys(store.accounts).sort(), ['outlook', 'qq']);
    assert.deepEqual(
      listAccountSummaries(path).map((a) => ({ key: a.key, active: a.active })),
      [
        { key: 'qq', active: true },
        { key: 'outlook', active: false },
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('credentials: 旧单账号格式自动迁移为容器 active=default（E302）', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'mail-credentials.json');
    saveCredentials(CREDS, path);
    // 模拟旧版裸 SmtpCredentials 文件
    writeFileSync(path, JSON.stringify(CREDS), 'utf-8');
    const store = loadCredentialsStore(path);
    assert.ok(store);
    assert.equal(store.active, 'default');
    assert.deepEqual(Object.keys(store.accounts), ['default']);
    assert.equal(loadCredentials(path)?.from, CREDS.from);
    assert.equal(loadCredentials(path)?.pass, '授权码');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('credentials: setActiveAccount 未知账号返回 false；无 accountKey 保存更新既有 active 账号（E302）', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'mail-credentials.json');
    saveCredentials(CREDS, path);
    assert.equal(setActiveAccount('nope', path), false);
    // 无 accountKey：覆盖当前 active（default）并保持 active
    saveCredentials({ ...CREDS, pass: '新授权码' }, path);
    assert.equal(loadCredentials(path)?.pass, '新授权码');
    const store = loadCredentialsStore(path);
    assert.ok(store);
    assert.equal(store.active, 'default');
    assert.deepEqual(Object.keys(store.accounts), ['default']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

