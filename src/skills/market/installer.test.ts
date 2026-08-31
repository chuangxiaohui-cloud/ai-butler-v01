import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeJsonl } from '../../log/jsonl.js';
import { MarketInstaller, type FetchLike } from './installer.js';
import { MarketStore } from './store.js';
import type { MarketSkillEntry } from './types.js';

const BASE_PACKAGE = {
  name: 'pcb-helper',
  version: '0.1.0',
  triggers: ['PCB 布线'],
  steps: ['分析布线'],
  verify: ['输出含关键走线'],
  permissions: ['none'],
};

function makeHarness(overrides: {
  packageText?: string;
  fetch?: FetchLike;
  confirm?: (permission: string) => boolean;
  entry?: MarketSkillEntry;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'market-installer-'));
  const storePath = join(dir, 'installs.jsonl');
  const store = new MarketStore(storePath);
  const installRoot = join(dir, 'market-skills');
  const fetchFn =
    overrides.fetch ??
    (async () => ({ ok: true, status: 200, text: overrides.packageText ?? JSON.stringify(BASE_PACKAGE) }));
  const confirm = overrides.confirm ?? (() => false);
  const installer = new MarketInstaller({ store, fetchFn, confirm, installRoot });
  const entry: MarketSkillEntry = overrides.entry ?? {
    name: 'pcb-helper',
    version: '0.1.0',
    sourceUrl: 'https://github.com/x/pcb-helper/raw/main/skill.json',
    permissions: ['none'],
  };
  return { installer, store, installRoot, storePath, dir, entry };
}

function teardown(dir: string, storePath: string): void {
  closeJsonl(storePath);
  rmSync(dir, { recursive: true, force: true });
}

test('market-installer: 无高风险权限直接安装成功（落盘 manifest + 记录）', async () => {
  const h = makeHarness();
  try {
    const outcome = await h.installer.install(h.entry);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.record?.status, 'installed');
    assert.equal(outcome.record?.checksum.length, 64);
    // B3：安装记录含 manifest 快照（包名/版本/触发词）
    assert.equal(outcome.record?.manifestSnapshot?.name, 'pcb-helper');
    assert.equal(outcome.record?.manifestSnapshot?.version, '0.1.0');
    assert.deepEqual(outcome.record?.manifestSnapshot?.triggers, ['PCB 布线']);
    const onDisk = JSON.parse(readFileSync(join(h.installRoot, 'pcb-helper', 'manifest.json'), 'utf-8'));
    assert.equal(onDisk.name, 'pcb-helper');
    assert.equal(h.store.statusOf('pcb-helper'), 'installed');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: 包权限声明超出市场条目范围拒绝', async () => {
  const h = makeHarness({
    packageText: JSON.stringify({ ...BASE_PACKAGE, permissions: ['filesystem'] }),
  });
  try {
    const outcome = await h.installer.install(h.entry);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /不一致/);
    assert.equal(h.store.statusOf('pcb-helper'), 'unknown');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: 高风险权限默认拒绝并列出（§8.2.3 逐项确认）', async () => {
  const h = makeHarness({
    packageText: JSON.stringify({ ...BASE_PACKAGE, permissions: ['filesystem', 'command'] }),
    entry: {
      name: 'pcb-helper',
      version: '0.1.0',
      sourceUrl: 'https://github.com/x/pcb-helper/raw/main/skill.json',
      permissions: ['filesystem', 'command'],
    },
  });
  try {
    const outcome = await h.installer.install(h.entry);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /权限/);
    assert.deepEqual(outcome.deniedPermissions, ['filesystem', 'command']);
    assert.equal(h.store.statusOf('pcb-helper'), 'unknown');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: confirm 放行后高风险权限安装成功', async () => {
  const h = makeHarness({
    packageText: JSON.stringify({ ...BASE_PACKAGE, permissions: ['command'] }),
    entry: {
      name: 'pcb-helper',
      version: '0.1.0',
      sourceUrl: 'https://github.com/x/pcb-helper/raw/main/skill.json',
      permissions: ['command'],
    },
    confirm: (permission) => permission === 'command',
  });
  try {
    const outcome = await h.installer.install(h.entry);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.record?.permissions[0], 'command');
    assert.equal(h.store.statusOf('pcb-helper'), 'installed');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: 拉取失败中止，不产生记录', async () => {
  const h = makeHarness({
    fetch: async () => ({ ok: false, status: 404, text: '' }),
  });
  try {
    const outcome = await h.installer.install(h.entry);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /拉取/);
    assert.equal(h.store.statusOf('pcb-helper'), 'unknown');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: manifest 非法 JSON 或 name 不一致拒绝', async () => {
  const badJson = makeHarness({ packageText: 'not-json' });
  try {
    const outcome = await badJson.installer.install(badJson.entry);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /manifest 校验失败/);
  } finally {
    teardown(badJson.dir, badJson.storePath);
  }
  const mismatch = makeHarness({
    packageText: JSON.stringify({ ...BASE_PACKAGE, name: 'other-skill' }),
  });
  try {
    const outcome = await mismatch.installer.install(mismatch.entry);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error ?? '', /不一致/);
  } finally {
    teardown(mismatch.dir, mismatch.storePath);
  }
});

test('market-installer: installFromLocalDir 直接安装本地包（command 权限 confirm 放行 + file:// 记录）', async () => {
  const h = makeHarness();
  try {
    const pkgDir = join(h.dir, 'pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'manifest.json'),
      JSON.stringify({ ...BASE_PACKAGE, permissions: ['command'] }),
      'utf-8',
    );
    const outcome = await h.installer.installFromLocalDir(pkgDir, (permission) => permission === 'command');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.record?.sourceUrl.startsWith('file:///'), true);
    assert.equal(outcome.record?.checksum.length, 64);
    const onDisk = JSON.parse(readFileSync(join(h.installRoot, 'pcb-helper', 'manifest.json'), 'utf-8'));
    assert.equal(onDisk.name, 'pcb-helper');
    assert.equal(h.store.statusOf('pcb-helper'), 'installed');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: installFromLocalDir 高风险权限缺省默认拒绝（与远程同一门禁）', async () => {
  const h = makeHarness();
  try {
    const pkgDir = join(h.dir, 'pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'manifest.json'),
      JSON.stringify({ ...BASE_PACKAGE, permissions: ['command'] }),
      'utf-8',
    );
    const outcome = await h.installer.installFromLocalDir(pkgDir);
    assert.equal(outcome.ok, false);
    assert.deepEqual(outcome.deniedPermissions, ['command']);
    assert.equal(h.store.statusOf('pcb-helper'), 'unknown');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: installFromLocalDir 包目录缺失或 manifest 非法拒绝', async () => {
  const h = makeHarness();
  try {
    const missing = await h.installer.installFromLocalDir(join(h.dir, 'no-such'));
    assert.equal(missing.ok, false);
    assert.match(missing.error ?? '', /读取本地 Skill 包失败/);

    const badDir = join(h.dir, 'bad');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'manifest.json'), 'not-json', 'utf-8');
    const bad = await h.installer.installFromLocalDir(badDir);
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? '', /manifest 校验失败/);
    assert.equal(h.store.statusOf('pcb-helper'), 'unknown');
  } finally {
    teardown(h.dir, h.storePath);
  }
});

test('market-installer: 卸载标记 disabled 保留记录；未安装返回错误', async () => {
  const h = makeHarness();
  try {
    const first = await h.installer.install(h.entry);
    assert.equal(first.ok, true);
    const removed = await h.installer.uninstall('pcb-helper');
    assert.equal(removed.ok, true);
    assert.equal(h.store.statusOf('pcb-helper'), 'disabled');
    assert.equal(h.store.list().length, 2, '卸载保留安装记录（不静默删除）');
    const again = await h.installer.uninstall('pcb-helper');
    assert.equal(again.ok, false);
    assert.match(again.error ?? '', /未找到/);
    const unknown = await h.installer.uninstall('never-installed');
    assert.equal(unknown.ok, false);
  } finally {
    teardown(h.dir, h.storePath);
  }
});
