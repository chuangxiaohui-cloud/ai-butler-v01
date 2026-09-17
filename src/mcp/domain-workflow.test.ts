import assert from 'node:assert/strict';
import test from 'node:test';

import { PARAMS } from '../config/params.js';
import type { DispatchResult } from './dispatcher.js';
import { executeDomainWorkflow, type DomainWorkflowPlan } from './domain-workflow.js';

function plan(completedRevisionCycles = 0): DomainWorkflowPlan {
  return {
    id: 'wf-demo',
    projectId: 'project-0123456789abcdef',
    completedRevisionCycles,
    nodes: [
      {
        id: 'inventory',
        kind: 'project_inventory',
        title: '盘点 Keil 项目画像',
        inputRefs: ['projects/demo.uvprojx'],
        outputKind: 'project_profile',
        agentId: 'keil',
        toolName: 'keil.InspectProjectProfile',
        args: { projectPath: 'projects/demo.uvprojx' },
        targetFiles: ['projects/demo.uvprojx'],
        risk: 'read_only',
        acceptance: '画像通过 schema 校验并持久化',
        onFailure: 'handoff',
      },
      {
        id: 'build',
        kind: 'build',
        title: '构建 Keil 工程',
        inputRefs: ['inventory'],
        outputKind: 'build_diagnostics',
        agentId: 'keil',
        toolName: 'keil.BuildProject',
        args: { projectPath: 'projects/demo.uvprojx', target: 'Debug' },
        targetFiles: ['projects/demo.uvprojx'],
        risk: 'build',
        acceptance: 'error 为零且退出状态成功',
        onFailure: 'revise',
      },
    ],
  };
}

function dispatchResult(toolName: string, ok = true): DispatchResult {
  const agentId = toolName.startsWith('vscode.') ? 'vscode' : 'keil';
  return {
    ok,
    agentId,
    output: JSON.stringify({ toolName, ok }),
    untrusted: true,
    attempts: 1,
    elapsedMs: 1,
    degraded: false,
    ...(ok ? {} : { error: 'build failed', failure: { code: 'tool_error' as const, message: 'build failed', retryable: true } }),
    task: { description: toolName, requestedTool: toolName, category: 'build' },
    status: ok ? 'succeeded' : 'failed',
    plan: [],
    progress: [],
    artifacts: [],
    evidence: [{ kind: 'mcp_tool_call', agentId, toolName: toolName.split('.')[1]!, attempt: 1, untrusted: true }],
    handoff: { required: !ok },
  };
}

test('领域工作流顺序执行盘点与 build 并汇总结构化证据', async () => {
  const calls: Array<{ toolName?: string; retryCount?: number; deterministic?: boolean }> = [];
  const result = await executeDomainWorkflow(plan(), {
    dispatch: async (_task, options) => {
      calls.push({ toolName: options?.toolName, retryCount: options?.retryCount, deterministic: options?.deterministic });
      return dispatchResult(options!.toolName!);
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.nodes.map((node) => node.status), ['completed', 'completed']);
  assert.deepEqual(result.artifacts.map((item) => item.kind), ['project_profile', 'build_diagnostics']);
  assert.equal((result.artifacts[1]?.data as { ok?: boolean }).ok, true);
  assert.deepEqual(result.evidence.map((item) => item.nodeId), ['inventory', 'build']);
  assert.deepEqual(calls, [
    { toolName: 'keil.InspectProjectProfile', retryCount: undefined, deterministic: true },
    { toolName: 'keil.BuildProject', retryCount: 0, deterministic: undefined },
  ]);
});

test('上游失败后跳过下游并按节点回退语义交接', async () => {
  let calls = 0;
  const result = await executeDomainWorkflow(plan(), {
    dispatch: async (_task, options) => {
      calls++;
      return dispatchResult(options!.toolName!, false);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.nodes.map((node) => node.status), ['failed', 'skipped']);
  assert.match(result.handoff.nextAction ?? '', /用户审查/);
});

test('达到 [P-154] 时在工具调用前熔断', async () => {
  let calls = 0;
  const result = await executeDomainWorkflow(plan(PARAMS.subAgentRevisionCycleLimit), {
    dispatch: async () => {
      calls++;
      return dispatchResult('keil.BuildProject');
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.nodes.map((node) => node.status), ['skipped', 'skipped']);
  assert.deepEqual(result.handoff.requiredEvidence, ['serial_log', 'recent_diff']);
});

test('拒绝节点 kind 与工具不匹配', async () => {
  const invalid = plan();
  invalid.nodes[0]!.toolName = 'keil.BuildProject';
  await assert.rejects(executeDomainWorkflow(invalid, { dispatch: async () => dispatchResult('x') }), /工具契约/);
});

test('VS Code 工作区盘点节点只按 code 类别调用只读工具', async () => {
  const vscodePlan: DomainWorkflowPlan = {
    id: 'wf-vscode',
    projectId: 'project-0123456789abcdef',
    completedRevisionCycles: 0,
    nodes: [{
      id: 'workspace',
      kind: 'workspace_inventory',
      title: '盘点 VS Code 工作区',
      inputRefs: ['projects/demo'],
      outputKind: 'vscode_workspace',
      agentId: 'vscode',
      toolName: 'vscode.InspectWorkspace',
      args: { root: 'projects/demo' },
      targetFiles: ['projects/demo/.vscode'],
      risk: 'read_only',
      acceptance: '返回配置证据且不执行任务',
      onFailure: 'handoff',
    }],
  };
  let seenCategory = '';
  const result = await executeDomainWorkflow(vscodePlan, {
    dispatch: async (_task, options) => {
      seenCategory = options?.category ?? '';
      return dispatchResult(options!.toolName!);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(seenCategory, 'code');
  assert.equal(result.artifacts[0]?.kind, 'vscode_workspace');
});

test('STM32-GCC build 节点走 build 类别且禁用自动重试', async () => {
  const stmPlan: DomainWorkflowPlan = {
    id: 'wf-stm32', projectId: 'project-0123456789abcdef', completedRevisionCycles: 0,
    nodes: [{ id: 'build', kind: 'stm32_build', title: '构建 STM32-GCC', inputRefs: ['profile'], outputKind: 'build_diagnostics', agentId: 'stm32-gcc', toolName: 'stm32-gcc.BuildProject', args: { root: 'projects/demo', buildDir: 'projects/demo/build' }, targetFiles: ['projects/demo'], risk: 'build', acceptance: '构建成功', onFailure: 'revise' }],
  };
  let seen: { category?: string; retryCount?: number } = {};
  const result = await executeDomainWorkflow(stmPlan, { dispatch: async (_task, options) => {
    seen = { category: options?.category, retryCount: options?.retryCount };
    return dispatchResult(options!.toolName!);
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, { category: 'build', retryCount: 0 });
});

test('E409 EDA 与仿真只读节点严格映射工具契约和类别', async () => {
  const plan: DomainWorkflowPlan = {
    id: 'wf-eda-simulation',
    projectId: 'project-0123456789abcdef',
    completedRevisionCycles: 0,
    nodes: [
      {
        id: 'kicad-profile',
        kind: 'kicad_project_inventory',
        title: '盘点 KiCad 工程',
        inputRefs: ['projects/demo.kicad_pro'],
        outputKind: 'eda_project',
        agentId: 'kicad',
        toolName: 'kicad.InspectProject',
        args: { projectPath: 'projects/demo.kicad_pro' },
        targetFiles: ['projects/demo.kicad_pro'],
        risk: 'read_only',
        acceptance: '返回工程、原理图和 PCB 只读证据',
        onFailure: 'handoff',
      },
      {
        id: 'kicad-erc',
        kind: 'kicad_erc',
        title: '运行 KiCad ERC',
        inputRefs: ['kicad-profile'],
        outputKind: 'erc_diagnostics',
        agentId: 'kicad',
        toolName: 'kicad.RunErc',
        args: { schematicPath: 'projects/demo.kicad_sch' },
        targetFiles: ['projects/demo.kicad_sch'],
        risk: 'read_only',
        acceptance: '报告已解析且原理图未改变',
        onFailure: 'handoff',
      },
      {
        id: 'ltspice-profile',
        kind: 'ltspice_schematic_inventory',
        title: '盘点 LTspice 原理图',
        inputRefs: ['projects/demo.asc'],
        outputKind: 'simulation_profile',
        agentId: 'ltspice',
        toolName: 'ltspice.InspectSchematic',
        args: { schematicPath: 'projects/demo.asc' },
        targetFiles: ['projects/demo.asc'],
        risk: 'read_only',
        acceptance: '提取元件、模型引用和仿真指令且不运行仿真',
        onFailure: 'handoff',
      },
    ],
  };
  const calls: Array<{ toolName?: string; category?: string; deterministic?: boolean; opKind?: string }> = [];
  const result = await executeDomainWorkflow(plan, {
    dispatch: async (_task, options) => {
      calls.push({
        toolName: options?.toolName,
        category: options?.category,
        deterministic: options?.deterministic,
        opKind: options?.opKind,
      });
      return dispatchResult(options!.toolName!);
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.nodes.map((node) => node.status), ['completed', 'completed', 'completed']);
  assert.deepEqual(result.nodes.map((node) => node.outputKind), ['eda_project', 'erc_diagnostics', 'simulation_profile']);
  assert.deepEqual(calls, [
    { toolName: 'kicad.InspectProject', category: 'eda', deterministic: true, opKind: undefined },
    { toolName: 'kicad.RunErc', category: 'eda', deterministic: true, opKind: undefined },
    { toolName: 'ltspice.InspectSchematic', category: 'simulation', deterministic: true, opKind: undefined },
  ]);
});

test('E413 写入与仿真节点映射风险与 opKind', async () => {
  const plan: DomainWorkflowPlan = {
    id: 'wf-write-sim',
    projectId: 'project-0123456789abcdef',
    completedRevisionCycles: 0,
    nodes: [
      {
        id: 'kicad-edit',
        kind: 'kicad_edit',
        title: '编辑原理图',
        inputRefs: ['projects/demo.kicad_sch'],
        outputKind: 'eda_edit',
        agentId: 'kicad',
        toolName: 'kicad.EditSchematic',
        args: { schematicPath: 'projects/demo.kicad_sch', edit: { kind: 'append_annotation', text: 'n' } },
        targetFiles: ['projects/demo.kicad_sch'],
        risk: 'write',
        acceptance: '事务提交成功',
        onFailure: 'handoff',
      },
      {
        id: 'ltspice-sim',
        kind: 'ltspice_simulate',
        title: '批仿真',
        inputRefs: ['projects/demo.asc'],
        outputKind: 'simulation_result',
        agentId: 'ltspice',
        toolName: 'ltspice.RunSimulation',
        args: { schematicPath: 'projects/demo.asc' },
        targetFiles: ['projects/demo.asc'],
        risk: 'simulate',
        acceptance: '批仿真成功',
        onFailure: 'handoff',
      },
    ],
  };
  const calls: Array<{ toolName?: string; category?: string; opKind?: string; retryCount?: number }> = [];
  const result = await executeDomainWorkflow(plan, {
    dispatch: async (_task, options) => {
      calls.push({
        toolName: options?.toolName,
        category: options?.category,
        opKind: options?.opKind,
        retryCount: options?.retryCount,
      });
      return dispatchResult(options!.toolName!);
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    { toolName: 'kicad.EditSchematic', category: 'eda', opKind: 'filegen', retryCount: 0 },
    { toolName: 'ltspice.RunSimulation', category: 'simulation', opKind: 'compile', retryCount: 0 },
  ]);
});

test('E409 节点 kind、agent、tool 不匹配时严格拒绝', async () => {
  const invalid: DomainWorkflowPlan = {
    id: 'wf-invalid-eda',
    projectId: 'project-0123456789abcdef',
    completedRevisionCycles: 0,
    nodes: [{
      id: 'bad',
      kind: 'kicad_erc',
      title: '错误映射',
      inputRefs: ['projects/demo.kicad_sch'],
      outputKind: 'erc_diagnostics',
      agentId: 'ltspice',
      toolName: 'kicad.RunErc',
      args: { schematicPath: 'projects/demo.kicad_sch' },
      targetFiles: ['projects/demo.kicad_sch'],
      risk: 'read_only',
      acceptance: '不应执行',
      onFailure: 'handoff',
    }],
  };
  await assert.rejects(
    executeDomainWorkflow(invalid, { dispatch: async () => dispatchResult('kicad.RunErc') }),
    /工具契约/,
  );
});

test('E424：hardware_flash 本地执行；无 perFlashConfirmed 不 spawn', async () => {
  const { createHash } = await import('node:crypto');
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(process.cwd(), 'projects', 'e424-wf-'));
  try {
    const fwPath = join(root, 'app.bin');
    const payload = Buffer.from('e424-wf');
    writeFileSync(fwPath, payload);
    const planFlash: DomainWorkflowPlan = {
      id: 'wf-flash',
      projectId: 'project-0123456789abcdef',
      completedRevisionCycles: 0,
      nodes: [{
        id: 'hardware-flash',
        kind: 'hardware_flash',
        title: '受控烧录',
        inputRefs: [fwPath],
        outputKind: 'flash_result',
        agentId: 'hardware',
        toolName: 'hardware.FlashFirmware',
        args: {
          firmwarePath: fwPath,
          deviceId: 'DEV-E424',
          flashToolKind: 'st-flash',
          flashExecutable: process.execPath,
        },
        targetFiles: [fwPath],
        risk: 'flash',
        acceptance: '烧录成功',
        onFailure: 'handoff',
      }],
    };
    let spawned = 0;
    const denied = await executeDomainWorkflow(
      planFlash,
      { dispatch: async () => { throw new Error('不应 MCP'); } },
      {
        hardware: {
          devices: { isAuthorized: () => true },
          flashRunner: async () => {
            spawned += 1;
            return { stdout: '', stderr: '', exitCode: 0, durationMs: 1, timedOut: false };
          },
        },
      },
    );
    assert.equal(denied.ok, false);
    assert.match(denied.handoff.reason ?? '', /perFlashConfirmed/);
    assert.equal(spawned, 0);

    planFlash.nodes[0]!.args.perFlashConfirmed = true;
    const ok = await executeDomainWorkflow(
      planFlash,
      { dispatch: async () => { throw new Error('不应 MCP'); } },
      {
        hardware: {
          devices: { isAuthorized: () => true },
          flashRunner: async () => {
            spawned += 1;
            return { stdout: 'ok', stderr: '', exitCode: 0, durationMs: 1, timedOut: false };
          },
        },
      },
    );
    assert.equal(ok.ok, true);
    assert.equal(spawned, 1);
    assert.equal(ok.artifacts[0]?.kind, 'flash_result');
    assert.equal(createHash('sha256').update(payload).digest('hex').length, 64);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
