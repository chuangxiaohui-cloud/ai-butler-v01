import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl } from '../log/jsonl.js';
import { DomainAuthStore, hostOfUrl, isDomainMatch } from './domain-auth.js';

test('domain-auth: 子域归属匹配（A4）', () => {
  assert.equal(isDomainMatch('szlcsc.com', 'szlcsc.com'), true);
  assert.equal(isDomainMatch('szlcsc.com', 'so.szlcsc.com'), true);
  assert.equal(isDomainMatch('szlcsc.com', 'www.szlcsc.com'), true);
  assert.equal(isDomainMatch('szlcsc.com', 'evil-szlcsc.com'), false);
  assert.equal(isDomainMatch('szlcsc.com', 'szlcsc.com.evil.io'), false);
  assert.equal(isDomainMatch('SZLCSC.com', 'so.szlcsc.com'), true); // 大小写不敏感
});

test('domain-auth: hostOfUrl 提取规范化 host', () => {
  assert.equal(hostOfUrl('https://So.SZLCSC.com/a?b=1'), 'so.szlcsc.com');
  assert.equal(hostOfUrl('http://127.0.0.1:8420/'), '127.0.0.1');
  assert.equal(hostOfUrl('not a url'), null);
});

test('domain-auth: 授权 → 放行；撤销 → 拒绝（A3 可撤销）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'domain-auth-'));
  const file = join(dir, 'domain-auth.jsonl');
  try {
    const store = new DomainAuthStore(file);
    assert.equal(store.isAuthorized('ds', 'szlcsc.com'), false); // 未授权默认拒绝
    store.authorize('ds', 'szlcsc.com');
    assert.equal(store.isAuthorized('ds', 'szlcsc.com'), true);
    assert.equal(store.isAuthorized('other-skill', 'szlcsc.com'), false); // 按 skill 隔离
    store.revoke('ds', 'szlcsc.com');
    assert.equal(store.isAuthorized('ds', 'szlcsc.com'), false); // 撤销后恢复拒绝
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('domain-auth: 授权记录持久化，新实例可重放（A3 本地持久化）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'domain-auth-'));
  const file = join(dir, 'domain-auth.jsonl');
  try {
    const first = new DomainAuthStore(file);
    first.authorize('ds', 'szlcsc.com');
    closeJsonl(file);
    assert.equal(existsSync(file), true);
    const second = new DomainAuthStore(file);
    assert.equal(second.isAuthorized('ds', 'szlcsc.com'), true);
    assert.equal(second.list('ds').length, 1);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});