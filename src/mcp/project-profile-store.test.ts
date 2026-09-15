import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { deriveProjectId, ProjectProfileStore } from './project-profile-store.js';
import type { ProjectMcpProfile } from './project-profile.js';

function profile(projectRoot: string): ProjectMcpProfile {
  return {
    schemaVersion: 1,
    projectId: deriveProjectId(projectRoot),
    projectRoot: resolve(projectRoot),
    platform: 'keil-mdk',
    chip: null,
    targets: ['Debug'],
    selectedTarget: 'Debug',
    capabilities: [{ agentId: 'keil', platform: 'keil-mdk', build: null, evidence: { source: 'project_file', evidenceRef: 'demo.uvprojx', observedAt: 1 } }],
    build: {
      agentId: 'keil',
      toolName: 'keil.BuildProject',
      args: { projectPath: join(projectRoot, 'demo.uvprojx'), target: 'Debug' },
    },
    flash: null,
    serial: null,
    sdkRoot: null,
    template: null,
    provenance: {
      build: { source: 'tool_probe', evidenceRef: 'keil.BuildProject', observedAt: 1 },
    },
    verifiedAt: 1,
  };
}

test('项目画像 store 使用稳定 projectId 原子保存并读回', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-profile-store-'));
  const projectRoot = join(root, 'projects', 'demo');
  const store = new ProjectProfileStore(join(root, 'data', 'project-profiles'));
  mkdirSync(projectRoot, { recursive: true });
  try {
    assert.equal(deriveProjectId(projectRoot), deriveProjectId(join(projectRoot, '.')));
    const saved = store.save(profile(projectRoot));
    assert.equal(saved.ok, true, saved.reason);
    assert.ok(saved.path);
    assert.equal(store.save({ ...profile(projectRoot), verifiedAt: 2 }).ok, true);
    const loaded = store.load(deriveProjectId(projectRoot));
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.equal(loaded.profile.verifiedAt, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('项目画像 store 拒绝损坏缓存、篡改 id 与非法文件名', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-profile-store-'));
  const projectRoot = join(root, 'projects', 'demo');
  const profileRoot = join(root, 'data', 'project-profiles');
  const store = new ProjectProfileStore(profileRoot);
  mkdirSync(projectRoot, { recursive: true });
  try {
    const current = profile(projectRoot);
    assert.equal(store.save(current).ok, true);
    const path = store.pathFor(current.projectId)!;
    writeFileSync(path, '{bad json', 'utf-8');
    const damaged = store.load(current.projectId);
    assert.equal(damaged.ok, false);
    if (!damaged.ok) assert.match(damaged.reason, /JSON 损坏/);
    writeFileSync(path, JSON.stringify({ ...current, projectId: 'project-0000000000000000' }), 'utf-8');
    const tampered = store.load(current.projectId);
    assert.equal(tampered.ok, false);
    if (!tampered.ok) assert.match(tampered.reason, /文件 projectId 不匹配/);
    assert.equal(store.pathFor('../escape'), null);
    assert.equal(store.save({ ...current, projectId: 'project-0000000000000000' }).ok, false);
    assert.equal(readFileSync(path, 'utf-8').includes('0000000000000000'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('规划读取按调用方截止时间屏蔽过期 build/flash，并要求重新盘点', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-profile-planning-'));
  const projectRoot = join(root, 'projects', 'demo');
  const store = new ProjectProfileStore(join(root, 'data', 'project-profiles'));
  mkdirSync(projectRoot, { recursive: true });
  try {
    const current = profile(projectRoot);
    current.flash = { agentId: 'keil', toolName: 'keil.FlashProject', args: { projectPath: join(projectRoot, 'demo.uvprojx') } };
    current.provenance.flash = { source: 'tool_probe', evidenceRef: 'keil.FlashProject', observedAt: 10 };
    current.provenance.build = { source: 'tool_probe', evidenceRef: 'keil.BuildProject', observedAt: 10 };
    assert.equal(store.save(current).ok, true);

    const fresh = store.loadForPlanning(current.projectId, 10);
    assert.equal(fresh.ok, true);
    if (fresh.ok) {
      assert.deepEqual(fresh.staleFields, []);
      assert.equal(fresh.reprobeRequired, false);
      assert.ok(fresh.profile.build);
      assert.ok(fresh.profile.flash);
    }

    const stale = store.loadForPlanning(current.projectId, 11);
    assert.equal(stale.ok, true);
    if (stale.ok) {
      assert.deepEqual(stale.staleFields?.sort(), ['build', 'flash']);
      assert.equal(stale.reprobeRequired, true);
      assert.equal(stale.profile.build, null);
      assert.equal(stale.profile.flash, null);
      assert.ok(stale.profile.capabilities.every((item) => item.build === null));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
