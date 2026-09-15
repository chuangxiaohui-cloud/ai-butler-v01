import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { deriveProjectId, ProjectProfileStore } from './project-profile-store.js';
import {
  isMcpDomainBuildRequest,
  planMcpWorkflowEntry,
  type McpWorkflowEntryRequest,
} from './workflow-entry.js';
import type { ProjectMcpProfile, ProjectPlatformCapability } from './project-profile.js';

function capability(
  projectRoot: string,
  agentId: 'keil' | 'stm32-gcc',
  observedAt: number,
): ProjectPlatformCapability {
  const root = resolve(projectRoot);
  return agentId === 'keil'
    ? {
        agentId,
        platform: 'keil-mdk',
        build: {
          agentId,
          toolName: 'keil.BuildProject',
          args: { projectPath: join(root, 'demo.uvprojx'), target: 'Debug' },
        },
        evidence: { source: 'tool_probe', evidenceRef: 'UV4.exe', observedAt },
      }
    : {
        agentId,
        platform: 'stm32-gcc-cmake',
        build: {
          agentId,
          toolName: 'stm32-gcc.BuildProject',
          args: { root, buildDir: join(root, 'build'), target: 'firmware' },
        },
        evidence: { source: 'tool_probe', evidenceRef: 'cmake.exe', observedAt },
      };
}

function profile(projectRoot: string, capabilities: ProjectPlatformCapability[], observedAt: number): ProjectMcpProfile {
  const root = resolve(projectRoot);
  return {
    schemaVersion: 1,
    projectId: deriveProjectId(root),
    projectRoot: root,
    platform: capabilities.length === 1 ? capabilities[0]!.platform : null,
    chip: null,
    targets: [],
    selectedTarget: null,
    capabilities,
    build: capabilities.length === 1 ? capabilities[0]!.build : null,
    flash: null,
    serial: null,
    sdkRoot: null,
    template: null,
    provenance: {
      projectRoot: { source: 'project_file', evidenceRef: 'project-root', observedAt },
      ...(capabilities.length === 1 && capabilities[0]!.build
        ? { build: capabilities[0]!.evidence }
        : {}),
    },
    verifiedAt: observedAt,
  };
}

function request(
  query: string,
  projectRoot: string,
  overrides: Partial<McpWorkflowEntryRequest> = {},
): McpWorkflowEntryRequest {
  return {
    query,
    approved: false,
    minimumObservedAt: 100,
    completedRevisionCycles: 0,
    projectRoot,
    ...overrides,
  };
}

function assertBuildPlan(
  result: ReturnType<typeof planMcpWorkflowEntry>,
  toolName: string,
): void {
  assert.equal(result.status, 'approval_required');
  assert.ok(result.plan);
  assert.equal(result.plan.nodes.length, 1);
  const node = result.plan.nodes[0]!;
  assert.equal(node.id, 'build');
  assert.equal(node.toolName, toolName);
  assert.equal(node.risk, 'build');
  assert.equal(node.kind === 'build' || node.kind === 'stm32_build', true);
  assert.equal(node.targetFiles.length, 1);
}

test('E408：新鲜 Keil/STM32-GCC capability 各只生成一个结构化 build 节点', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-workflow-entry-fresh-'));
  const profileRoot = join(root, 'profiles');
  const store = new ProjectProfileStore(profileRoot);
  try {
    const cases: Array<{
      agentId: 'keil' | 'stm32-gcc';
      query: string;
      toolName: string;
    }> = [
      { agentId: 'keil', query: '请编译 Keil 工程', toolName: 'keil.BuildProject' },
      { agentId: 'stm32-gcc', query: '请执行 stm32-gcc build', toolName: 'stm32-gcc.BuildProject' },
    ];
    for (const item of cases) {
      const projectRoot = join(root, item.agentId);
      mkdirSync(projectRoot, { recursive: true });
      const saved = store.save(profile(projectRoot, [capability(projectRoot, item.agentId, 100)], 100));
      assert.equal(saved.ok, true, saved.reason);
      const result = planMcpWorkflowEntry(
        request(item.query, projectRoot, { platform: item.agentId }),
        store,
      );
      assertBuildPlan(result, item.toolName);
      assert.deepEqual(result.plan?.nodes[0]?.args, item.agentId === 'keil'
        ? { projectPath: join(resolve(projectRoot), 'demo.uvprojx'), target: 'Debug' }
        : { root: resolve(projectRoot), buildDir: join(resolve(projectRoot), 'build'), target: 'firmware' });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E408：缺失或过期画像只生成只读 inventory 节点，绝不混入 build', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-workflow-entry-inventory-'));
  const projectRoot = join(root, 'keil-project');
  const projectPath = join(projectRoot, 'demo.uvprojx');
  const store = new ProjectProfileStore(join(root, 'profiles'));
  mkdirSync(projectRoot, { recursive: true });
  try {
    const missing = planMcpWorkflowEntry(
      request(`请编译 Keil 工程 ${projectPath}`, projectRoot, { projectPath, platform: 'keil' }),
      store,
    );
    assert.equal(missing.status, 'inventory_required');
    assert.ok(missing.plan);
    assert.equal(missing.plan.nodes.length, 1);
    assert.equal(missing.plan.nodes[0]?.kind, 'project_inventory');
    assert.equal(missing.plan.nodes[0]?.risk, 'read_only');
    assert.equal(missing.plan.nodes.some((node) => node.risk === 'build'), false);

    const saved = store.save(profile(projectRoot, [capability(projectRoot, 'keil', 100)], 100));
    assert.equal(saved.ok, true, saved.reason);
    const stale = planMcpWorkflowEntry(
      request(`请编译 Keil 工程 ${projectPath}`, projectRoot, {
        projectPath,
        platform: 'keil',
        minimumObservedAt: 101,
      }),
      store,
    );
    assert.equal(stale.status, 'inventory_required');
    assert.ok(stale.plan);
    assert.equal(stale.plan.nodes.length, 1);
    assert.equal(stale.plan.nodes[0]?.kind, 'project_inventory');
    assert.equal(stale.plan.nodes[0]?.risk, 'read_only');
    assert.equal(stale.plan.nodes.some((node) => node.risk === 'build'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E408：多平台画像在请求未明确平台时必须先澄清', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-workflow-entry-ambiguous-'));
  const projectRoot = join(root, 'multi-platform');
  const store = new ProjectProfileStore(join(root, 'profiles'));
  mkdirSync(projectRoot, { recursive: true });
  try {
    const saved = store.save(profile(projectRoot, [
      capability(projectRoot, 'keil', 100),
      capability(projectRoot, 'stm32-gcc', 100),
    ], 100));
    assert.equal(saved.ok, true, saved.reason);
    const result = planMcpWorkflowEntry(
      request(`请编译工程 ${projectRoot}，Keil 和 stm32-gcc 都可用`, projectRoot),
      store,
    );
    assert.equal(result.status, 'clarification_required');
    assert.match(result.message, /明确选择/);
    assert.equal(result.plan, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E408：构建识别只覆盖带平台证据的 build 请求', () => {
  assert.equal(isMcpDomainBuildRequest('请编译 Keil 工程'), true);
  assert.equal(isMcpDomainBuildRequest('请执行 stm32-gcc build'), true);
  assert.equal(isMcpDomainBuildRequest('请查看 Keil 工程有哪些 target'), false);
  assert.equal(isMcpDomainBuildRequest('请编译普通 CMake 项目'), false);
});
