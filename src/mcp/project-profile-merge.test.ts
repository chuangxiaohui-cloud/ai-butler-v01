import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { mergeProjectMcpProfiles } from './project-profile-merge.js';
import { deriveProjectId, ProjectProfileStore } from './project-profile-store.js';
import type {
  ProjectMcpProfile,
  ProjectPlatformCapability,
  ProjectProfileEvidence,
  ProjectProfileSource,
  ProjectToolRef,
} from './project-profile.js';

function evidence(source: ProjectProfileSource, observedAt: number, evidenceRef: string): ProjectProfileEvidence {
  return { source, observedAt, evidenceRef };
}

function tool(agentId: string, toolName: string, args: Record<string, unknown>): ProjectToolRef {
  return { agentId, toolName, args };
}

function capability(
  agentId: string,
  platform: string,
  observedAt: number,
  source: ProjectProfileSource,
  build: ProjectToolRef | null,
): ProjectPlatformCapability {
  return {
    agentId,
    platform,
    build,
    evidence: evidence(source, observedAt, `${agentId}:profile`),
  };
}

function keilBuild(projectRoot: string): ProjectToolRef {
  return tool('keil', 'keil.BuildProject', {
    projectPath: join(projectRoot, 'demo.uvprojx'),
    target: 'Debug',
  });
}

function stm32Build(projectRoot: string): ProjectToolRef {
  return tool('stm32-gcc', 'stm32-gcc.BuildProject', {
    root: projectRoot,
    buildDir: join(projectRoot, 'build'),
    target: 'firmware',
  });
}

function profile(projectRoot: string): ProjectMcpProfile {
  const root = resolve(projectRoot);
  const build = keilBuild(root);
  return {
    schemaVersion: 1,
    projectId: deriveProjectId(root),
    projectRoot: root,
    platform: 'keil-mdk',
    chip: 'STM32F103C8',
    targets: ['Debug'],
    selectedTarget: 'Debug',
    capabilities: [capability('keil', 'keil-mdk', 10, 'tool_probe', build)],
    build,
    flash: null,
    serial: null,
    sdkRoot: null,
    template: null,
    provenance: {
      platform: evidence('tool_probe', 10, 'keil:platform'),
      chip: evidence('tool_probe', 10, 'keil:chip'),
      targets: evidence('project_file', 10, 'keil:targets'),
      selectedTarget: evidence('project_file', 10, 'keil:selectedTarget'),
      build: evidence('tool_probe', 10, 'keil:build'),
    },
    verifiedAt: 10,
  };
}

function profileWithChip(
  projectRoot: string,
  chip: string,
  source: ProjectProfileSource,
  observedAt: number,
): ProjectMcpProfile {
  const value = profile(projectRoot);
  value.chip = chip;
  value.provenance.chip = evidence(source, observedAt, `${source}:chip`);
  return value;
}

function stm32Profile(projectRoot: string): ProjectMcpProfile {
  const root = resolve(projectRoot);
  const build = stm32Build(root);
  return {
    schemaVersion: 1,
    projectId: deriveProjectId(root),
    projectRoot: root,
    platform: 'stm32-gcc-cmake',
    chip: 'STM32F407xG',
    targets: ['firmware'],
    selectedTarget: 'firmware',
    capabilities: [capability('stm32-gcc', 'stm32-gcc-cmake', 20, 'tool_probe', build)],
    build,
    flash: null,
    serial: null,
    sdkRoot: null,
    template: null,
    provenance: {
      platform: evidence('project_file', 20, 'stm32:platform'),
      chip: evidence('project_file', 20, 'stm32:chip'),
      targets: evidence('project_file', 20, 'stm32:targets'),
      selectedTarget: evidence('project_file', 20, 'stm32:selectedTarget'),
      build: evidence('tool_probe', 20, 'stm32:build'),
    },
    verifiedAt: 20,
  };
}

test('字段级合并保留同根 Keil 与 STM32-GCC 能力，并按字段证据选择优选值', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-profile-merge-'));
  mkdirSync(root, { recursive: true });
  try {
    const merged = mergeProjectMcpProfiles(profile(root), stm32Profile(root));
    assert.deepEqual(merged.capabilities.map((item) => item.agentId), ['keil', 'stm32-gcc']);
    assert.equal(merged.platform, 'stm32-gcc-cmake', 'project_file 应胜过 tool_probe');
    assert.equal(merged.chip, 'STM32F407xG', 'project_file 应胜过 tool_probe');
    assert.equal(merged.build?.agentId, 'stm32-gcc');
    assert.deepEqual(merged.targets, ['Debug', 'firmware']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('字段来源按用户确认 > 工程文件 > 工具探测 > 缓存 > 模型候选，低优先级不能覆盖', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-profile-priority-'));
  try {
    let merged = profileWithChip(root, 'MODEL', 'model_candidate', 1);
    for (const [chip, source, observedAt] of [
      ['CACHE', 'cache', 2],
      ['PROBE', 'tool_probe', 3],
      ['FILE', 'project_file', 4],
      ['USER', 'user_confirmed', 5],
    ] as const) {
      merged = mergeProjectMcpProfiles(merged, profileWithChip(root, chip, source, observedAt));
      assert.equal(merged.chip, chip);
    }
    const staleLower = profileWithChip(root, 'STALE-LOWER', 'project_file', 999);
    assert.equal(mergeProjectMcpProfiles(merged, staleLower).chip, 'USER');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('同优先级证据只有更新 observedAt 才能替换字段', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-profile-freshness-'));
  try {
    const current = profileWithChip(root, 'OLD', 'project_file', 100);
    const newer = profileWithChip(root, 'NEW', 'project_file', 101);
    const older = profileWithChip(root, 'OLDER', 'project_file', 99);
    assert.equal(mergeProjectMcpProfiles(current, newer).chip, 'NEW');
    assert.equal(mergeProjectMcpProfiles(newer, older).chip, 'NEW');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('不同 projectRoot 的画像拒绝合并', () => {
  const first = mkdtempSync(join(tmpdir(), 'project-profile-root-a-'));
  const second = mkdtempSync(join(tmpdir(), 'project-profile-root-b-'));
  try {
    assert.throws(
      () => mergeProjectMcpProfiles(profile(first), profile(second)),
      /只能合并同一 projectId\/projectRoot/,
    );
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('store mergeAndSave 同根追加画像时保留两个平台能力', () => {
  const root = mkdtempSync(join(tmpdir(), 'project-profile-store-merge-'));
  const projectRoot = join(root, 'project');
  mkdirSync(projectRoot, { recursive: true });
  try {
    const store = new ProjectProfileStore(join(root, 'profiles'));
    const keil = profile(projectRoot);
    const stm32 = stm32Profile(projectRoot);
    assert.equal(store.mergeAndSave(keil).ok, true);
    assert.equal(store.mergeAndSave(stm32).ok, true);
    const loaded = store.load(keil.projectId);
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.deepEqual(loaded.profile.capabilities.map((item) => item.agentId), ['keil', 'stm32-gcc']);
      assert.equal(loaded.profile.platform, 'stm32-gcc-cmake');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
