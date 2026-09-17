import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { deriveProjectId, ProjectProfileStore } from './project-profile-store.js';
import {
  buildPlatformChoiceFollowUpQuery,
  formatPlatformChoices,
  isMcpDomainBuildRequest,
  isMcpKicadEditRequest,
  isMcpLtspiceSimulateRequest,
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

test('E408：缺失画像或 capability 过期只生成只读 inventory，绝不混入 build', () => {
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
    // capability 本身过期 → build 被清空，仍只盘点
    const staleCapability = planMcpWorkflowEntry(
      request(`请编译 Keil 工程 ${projectPath}`, projectRoot, {
        projectPath,
        platform: 'keil',
        minimumObservedAt: 101,
      }),
      store,
    );
    assert.equal(staleCapability.status, 'inventory_required');
    assert.ok(staleCapability.plan);
    assert.equal(staleCapability.plan.nodes.length, 1);
    assert.equal(staleCapability.plan.nodes[0]?.kind, 'project_inventory');
    assert.equal(staleCapability.plan.nodes.some((node) => node.risk === 'build'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E437：画像部分过期但仍有可验证 build → inventory→build dependsOn 链且须批准', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-workflow-entry-chain-'));
  const projectRoot = join(root, 'keil-project');
  const projectPath = join(projectRoot, 'demo.uvprojx');
  const store = new ProjectProfileStore(join(root, 'profiles'));
  mkdirSync(projectRoot, { recursive: true });
  try {
    const base = profile(projectRoot, [capability(projectRoot, 'keil', 200)], 200);
    const saved = store.save({
      ...base,
      chip: 'STM32F103',
      provenance: {
        ...base.provenance,
        // 非 capability 字段过期 → reprobeRequired，但 capability.build 仍保留
        chip: { source: 'tool_probe', evidenceRef: 'old-chip', observedAt: 50 },
      },
    });
    assert.equal(saved.ok, true, saved.reason);
    const result = planMcpWorkflowEntry(
      request(`请编译 Keil 工程 ${projectPath}`, projectRoot, {
        projectPath,
        platform: 'keil',
        minimumObservedAt: 100,
      }),
      store,
    );
    assert.equal(result.status, 'approval_required');
    assert.ok(result.plan);
    assert.equal(result.plan.nodes.length, 2);
    assert.equal(result.plan.nodes[0]?.kind, 'project_inventory');
    assert.deepEqual(result.plan.nodes[0]?.dependsOn, []);
    assert.equal(result.plan.nodes[1]?.id, 'build');
    assert.equal(result.plan.nodes[1]?.risk, 'build');
    assert.deepEqual(result.plan.nodes[1]?.dependsOn, [result.plan.nodes[0]!.id]);
    assert.match(result.message, /先只读盘点再构建/);

    const approved = planMcpWorkflowEntry(
      request(`请编译 Keil 工程 ${projectPath}`, projectRoot, {
        projectPath,
        platform: 'keil',
        minimumObservedAt: 100,
        approved: true,
      }),
      store,
    );
    assert.equal(approved.status, 'ready');
    assert.equal(approved.plan?.nodes.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E408/E432/E433/E436：多平台画像未明确平台时先并行只读盘点并附 platformChoices', () => {
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
    assert.equal(result.status, 'inventory_required');
    assert.match(result.message, /并行只读盘点/);
    assert.equal(result.plan?.nodes.length, 2);
    assert.ok(result.plan?.nodes.every((n) => n.parallelGroup === undefined));
    assert.deepEqual(
      result.plan?.nodes.map((n) => n.dependsOn),
      [[], []],
    );
    assert.ok(result.plan?.nodes.every((n) => n.risk === 'read_only'));
    assert.deepEqual(
      result.plan?.nodes.map((n) => n.agentId).sort(),
      ['keil', 'stm32-gcc'],
    );
    assert.equal(result.platformChoices?.length, 2);
    assert.deepEqual(
      result.platformChoices?.map((c) => c.id).sort(),
      ['keil', 'stm32-gcc'],
    );
    assert.match(formatPlatformChoices(result.platformChoices) ?? '', /构建前请选择平台/);
    const followUp = buildPlatformChoiceFollowUpQuery({ id: 'keil' }, projectRoot);
    assert.match(followUp, /Keil/);
    assert.match(followUp, new RegExp(projectRoot.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')));
    assert.equal(isMcpDomainBuildRequest(followUp), true);
    assert.equal(
      isMcpDomainBuildRequest(buildPlatformChoiceFollowUpQuery({ id: 'stm32-gcc' }, projectRoot)),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('E432/E436：单平台盘点不加 dependsOn', () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-workflow-entry-single-inv-'));
  const projectRoot = join(root, 'keil-only');
  const projectPath = join(projectRoot, 'demo.uvprojx');
  const store = new ProjectProfileStore(join(root, 'profiles'));
  mkdirSync(projectRoot, { recursive: true });
  try {
    const result = planMcpWorkflowEntry(
      request(`请编译 Keil 工程 ${projectPath}`, projectRoot, { projectPath, platform: 'keil' }),
      store,
    );
    assert.equal(result.status, 'inventory_required');
    assert.equal(result.plan?.nodes.length, 1);
    assert.equal(result.plan?.nodes[0]?.parallelGroup, undefined);
    assert.equal(result.plan?.nodes[0]?.dependsOn, undefined);
    assert.equal(result.plan?.nodes[0]?.agentId, 'keil');
    assert.equal(result.platformChoices, undefined);
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

test('E411/E424：统一入口拒绝串口；烧录可生成 hardware_flash 计划', () => {
  const flash = planMcpWorkflowEntry({
    query: '请用 st-flash 烧录 projects/fw/app.bin 设备：JLINK-1',
    approved: false,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(flash.status, 'approval_required');
  assert.equal(flash.plan?.nodes[0]?.kind, 'hardware_flash');
  assert.equal(flash.plan?.nodes[0]?.args?.flashToolKind, 'st-flash');
  assert.equal(flash.plan?.nodes[0]?.args?.deviceId, 'JLINK-1');
  assert.equal(flash.plan?.nodes[0]?.risk, 'flash');
  assert.equal(flash.plan?.nodes[0]?.toolName, 'hardware.FlashFirmware');

  const flashReady = planMcpWorkflowEntry({
    query: '请用 st-flash 烧录 projects/fw/app.bin 设备：JLINK-1',
    approved: true,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(flashReady.status, 'ready');
  assert.match(flashReady.message, /perFlashConfirmed/);

  const serial = planMcpWorkflowEntry({
    query: '请打开串口读日志',
    approved: true,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(serial.status, 'clarification_required');
  assert.match(serial.message, /不接受串口|硬件门禁/);
});

test('E413：KiCad 编辑与 LTspice 仿真须批准且无批准不生成 ready', () => {
  const edit = planMcpWorkflowEntry({
    query: '请编辑 KiCad 原理图 projects/board/demo.kicad_sch 注解：E413',
    approved: false,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(edit.status, 'approval_required');
  assert.equal(edit.plan?.nodes[0]?.kind, 'kicad_edit');
  assert.equal(edit.plan?.nodes[0]?.risk, 'write');
  assert.equal(edit.plan?.nodes[0]?.toolName, 'kicad.EditSchematic');

  const editReady = planMcpWorkflowEntry({
    query: '请编辑 KiCad 原理图 projects/board/demo.kicad_sch 注解：E413',
    approved: true,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(editReady.status, 'ready');

  const sim = planMcpWorkflowEntry({
    query: '请对 LTspice projects/analog/demo.asc 做仿真',
    approved: false,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(sim.status, 'approval_required');
  assert.equal(sim.plan?.nodes[0]?.kind, 'ltspice_simulate');
  assert.equal(sim.plan?.nodes[0]?.risk, 'simulate');

  assert.equal(isMcpKicadEditRequest('编辑 KiCad projects/a.kicad_sch 注解：x'), true);
  assert.equal(isMcpLtspiceSimulateRequest('仿真 LTspice projects/a.asc'), true);
});

test('E419：LTspice 问句可带白名单批开关；非法开关澄清', () => {
  const ok = planMcpWorkflowEntry({
    query: '请对 LTspice projects/analog/demo.asc 做仿真 开关：-ascii',
    approved: false,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(ok.status, 'approval_required');
  assert.deepEqual(ok.plan?.nodes[0]?.args.extraBatchFlags, ['-ascii']);
  assert.match(ok.message, /-ascii/);

  const bad = planMcpWorkflowEntry({
    query: '请对 LTspice projects/analog/demo.asc 做仿真 开关：-evil',
    approved: false,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(bad.status, 'clarification_required');
  assert.match(bad.message, /白名单/);
});

test('E418：KiCad PCB 有界编辑须批准且工具为 EditPcb', () => {
  const edit = planMcpWorkflowEntry({
    query: '请编辑 KiCad PCB projects/board/demo.kicad_pcb 注解：E418',
    approved: false,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(edit.status, 'approval_required');
  assert.equal(edit.plan?.nodes[0]?.kind, 'kicad_pcb_edit');
  assert.equal(edit.plan?.nodes[0]?.toolName, 'kicad.EditPcb');
  assert.equal(edit.plan?.nodes[0]?.risk, 'write');

  const ready = planMcpWorkflowEntry({
    query: '请编辑 KiCad PCB projects/board/demo.kicad_pcb 注解：E418',
    approved: true,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  });
  assert.equal(ready.status, 'ready');
  assert.equal(isMcpKicadEditRequest('编辑 PCB projects/a.kicad_pcb 注解：x'), true);
});
