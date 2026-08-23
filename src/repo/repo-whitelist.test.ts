import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl } from '../log/jsonl.js';
import { RepoWhitelist } from './repo-whitelist.js';
import type { RepoIdentity } from './types.js';

const REPO: RepoIdentity = { host: 'github.com', owner: 'chuangxiaohui-cloud', name: 'ai-butler-v01' };
const OTHER: RepoIdentity = { host: 'gitee.com', owner: 'cxv138', name: 'hardware-notes' };

function tmpPath() {
  const dir = mkdtempSync(join(tmpdir(), 'repo-whitelist-'));
  return { dir, file: join(dir, 'whitelist.jsonl') };
}

test('repo-whitelist: 默认空白名单，未授权仓库拒绝（§11.4 白名单）', () => {
  const { dir, file } = tmpPath();
  try {
    const whitelist = new RepoWhitelist(file);
    assert.equal(whitelist.isAuthorized(REPO), false);
    assert.equal(whitelist.list().length, 0);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repo-whitelist: authorize 后放行且幂等，落盘重载保持', () => {
  const { dir, file } = tmpPath();
  try {
    const whitelist = new RepoWhitelist(file);
    whitelist.authorize(REPO);
    whitelist.authorize(REPO); // 幂等：不重复追加
    assert.equal(whitelist.isAuthorized(REPO), true);
    assert.equal(whitelist.list().length, 1);

    const reloaded = new RepoWhitelist(file);
    assert.equal(reloaded.isAuthorized(REPO), true, '落盘后重载保持');
    assert.equal(reloaded.list().length, 1);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repo-whitelist: revoke 只移除目标仓库，不影响其他', () => {
  const { dir, file } = tmpPath();
  try {
    const whitelist = new RepoWhitelist(file);
    whitelist.authorize(REPO);
    whitelist.authorize(OTHER);
    whitelist.revoke(REPO);
    assert.equal(whitelist.isAuthorized(REPO), false);
    assert.equal(whitelist.isAuthorized(OTHER), true);
    assert.equal(whitelist.list().length, 1);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repo-whitelist: 损坏行忽略，不阻塞读取', () => {
  const { dir, file } = tmpPath();
  try {
    const whitelist = new RepoWhitelist(file);
    whitelist.authorize(REPO);
    appendFileSync(file, 'not-json\n');
    const reloaded = new RepoWhitelist(file);
    assert.equal(reloaded.isAuthorized(REPO), true, '损坏行被忽略');
    assert.equal(reloaded.list().length, 1);
  } finally {
    closeJsonl(file);
    rmSync(dir, { recursive: true, force: true });
  }
});
