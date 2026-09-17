import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpAgentSkill } from './index.js';
import type { SkillDeps } from '../deps.js';
import type { DispatchResult } from '../../mcp/dispatcher.js';
import { deriveProjectId, ProjectProfileStore } from '../../mcp/project-profile-store.js';
import type { ProjectMcpProfile } from '../../mcp/project-profile.js';
import { WorkflowPlanStore } from '../../mcp/workflow-plan-store.js';
import { fingerprintDomainWorkflowPlan } from '../../mcp/workflow-plan-fingerprint.js';

const skill = createMcpAgentSkill();

function depsWithSubAgent(
  dispatch: SkillDeps['subAgent'],
  projectProfiles?: SkillDeps['projectProfiles'],
  workflowPlans?: SkillDeps['workflowPlans'],
): SkillDeps {
  return {
    callVLM: async () => '',
    subAgent: dispatch,
    ...(projectProfiles ? { projectProfiles } : {}),
    ...(workflowPlans ? { workflowPlans } : {}),
  };
}

function runResult(overrides: Partial<DispatchResult>): DispatchResult {
  return {
    ok: false,
    agentId: '',
    output: '',
    untrusted: true,
    attempts: 0,
    elapsedMs: 0,
    degraded: false,
    task: { description: '测试任务' },
    status: 'failed',
    plan: [],
    progress: [],
    artifacts: [],
    evidence: [],
    handoff: { required: true },
    ...overrides,
  };
}

function keilProfile(projectRoot: string, observedAt = 100): ProjectMcpProfile {
  const root = resolve(projectRoot);
  const build = {
    agentId: 'keil' as const,
    toolName: 'keil.BuildProject' as const,
    args: { projectPath: join(root, 'demo.uvprojx'), target: 'Debug' },
  };
  return {
    schemaVersion: 1,
    projectId: deriveProjectId(root),
    projectRoot: root,
    platform: 'keil-mdk',
    chip: null,
    targets: ['Debug'],
    selectedTarget: 'Debug',
    capabilities: [{
      agentId: 'keil',
      platform: 'keil-mdk',
      build,
      evidence: { source: 'tool_probe', evidenceRef: 'UV4.exe', observedAt },
    }],
    build,
    flash: null,
    serial: null,
    sdkRoot: null,
    template: null,
    provenance: {
      projectRoot: { source: 'project_file', evidenceRef: 'project-root', observedAt },
      build: { source: 'tool_probe', evidenceRef: 'UV4.exe', observedAt },
    },
    verifiedAt: observedAt,
  };
}

function installProfile(projectRoot: string, store: ProjectProfileStore): ProjectProfileStore {
  const saved = store.save(keilProfile(projectRoot));
  assert.equal(saved.ok, true, saved.reason);
  return store;
}

test('mcp-agent: 未装配 subAgent 时诚实提示', async () => {
  const out = await skill.execute(
    { query: '列出当前进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    { callVLM: async () => '' },
  );
  assert.match(String(out.result), /未装配/);
});

test('mcp-agent: 成功 dispatch 返回工具输出（untrusted）', async () => {
  const deps = depsWithSubAgent({
    dispatch: async () => runResult({
      ok: true,
      agentId: 'windows',
      output: 'PID 1234 explorer.exe',
      attempts: 1,
      elapsedMs: 50,
      status: 'succeeded',
      artifacts: [{ kind: 'text', content: 'PID 1234 explorer.exe', untrusted: true }],
      handoff: { required: false },
    }),
  });
  const out = await skill.execute(
    { query: '列出当前进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    deps,
  );
  assert.match(String(out.result), /PID 1234/);
});

test('mcp-agent: 显式工具名透传给调度器', async () => {
  let seenToolName: string | undefined;
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenToolName = options?.toolName;
      return runResult({ error: 'x', failure: { code: 'tool_error', message: 'x', retryable: true } });
    },
  });
  await skill.execute(
    { query: '用 windows.Process 查看进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    deps,
  );
  assert.equal(seenToolName, 'windows.Process');
});

test('mcp-agent: 失败时返回错误并低置信', async () => {
  const deps = depsWithSubAgent({
    dispatch: async () => runResult({
      agentId: 'windows',
      attempts: 1,
      elapsedMs: 10,
      error: '工具不在白名单内',
      failure: { code: 'validation_error', message: '工具不在白名单内', retryable: false },
    }),
  });
  const out = await skill.execute(
    { query: '列出进程', attachmentSignals: [], rawFiles: [], memory: null, workingMemory: [], params: { mode: 'execute', userId: 'u', conversationId: 'u' } },
    deps,
  );
  assert.match(String(out.result), /工具不在白名单内/);
  assert.equal(out.confidence, 0.3);
});

test('mcp-agent: E408 未批准的 Keil build 只生成计划，不执行 build', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-agent-approval-'));
  const projectPath = join(root, 'demo.uvprojx');
  mkdirSync(root, { recursive: true });
  const store = installProfile(root, new ProjectProfileStore(join(root, 'profiles')));
  const plans = new WorkflowPlanStore(join(root, 'plans.jsonl'));
  let calls = 0;
  try {
    const deps = depsWithSubAgent({
      dispatch: async () => {
        calls++;
        return runResult({ ok: true, agentId: 'keil', status: 'succeeded', handoff: { required: false } });
      },
    }, store, plans);
    const out = await skill.execute(
      {
        query: `请编译 Keil 工程 ${projectPath}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mcpWorkflowApproved: false, minimumObservedAt: 0, completedRevisionCycles: 0 },
      },
      deps,
    );
    assert.equal(calls, 0);
    assert.match(String(out.result), /批准/);
    assert.match(String(out.result), /计划指纹/);
    assert.equal(out.artifacts?.[0]?.kind, 'mcp-domain-workflow-plan');
    assert.equal(typeof out.artifacts?.[0]?.data.fingerprint, 'string');
    assert.equal(plans.list().length, 1);
    assert.equal(plans.list()[0]?.status, 'pending_approval');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mcp-agent: E412 指纹漂移时批准恢复零 MCP 调用', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-agent-drift-'));
  const projectPath = join(root, 'demo.uvprojx');
  mkdirSync(root, { recursive: true });
  const store = installProfile(root, new ProjectProfileStore(join(root, 'profiles')));
  const plans = new WorkflowPlanStore(join(root, 'plans.jsonl'));
  let calls = 0;
  try {
    const deps = depsWithSubAgent({
      dispatch: async () => {
        calls++;
        return runResult({ ok: true, agentId: 'keil', status: 'succeeded', handoff: { required: false } });
      },
    }, store, plans);
    const pending = await skill.execute(
      {
        query: `请编译 Keil 工程 ${projectPath}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mcpWorkflowApproved: false, minimumObservedAt: 0, completedRevisionCycles: 0 },
      },
      deps,
    );
    const fingerprint = String(pending.artifacts?.[0]?.data.fingerprint ?? '');
    assert.ok(fingerprint.length === 64);
    // 篡改挂起指纹对应的计划节点语义，模拟画像/计划漂移
    const record = plans.findByFingerprint(fingerprint);
    assert.ok(record);
    record!.plan.nodes[0]!.args = { ...record!.plan.nodes[0]!.args, target: 'Release' };
    // 重新保存一个不同指纹的 pending，使旧指纹与当前重算计划不一致
    const staleFingerprint = fingerprintDomainWorkflowPlan({
      ...record!.plan,
      nodes: record!.plan.nodes.map((node) => ({
        ...node,
        args: { ...node.args, target: 'Stale' },
      })),
    });
    const out = await skill.execute(
      {
        query: `请编译 Keil 工程 ${projectPath}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: {
          mcpWorkflowApproved: true,
          minimumObservedAt: 0,
          completedRevisionCycles: 0,
          workflowPlanFingerprint: staleFingerprint,
        },
      },
      deps,
    );
    assert.equal(calls, 0);
    assert.match(String(out.result), /指纹|漂移|重新/);
    assert.equal(out.artifacts?.[0]?.data.resumeError, 'not_found');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mcp-agent: E408 批准后通过 executeDomainWorkflow 调用结构化 Keil build', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-agent-approved-'));
  const projectPath = join(root, 'demo.uvprojx');
  mkdirSync(root, { recursive: true });
  const store = installProfile(root, new ProjectProfileStore(join(root, 'profiles')));
  let seenTask = '';
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  try {
    const deps = depsWithSubAgent({
      dispatch: async (task, options) => {
        seenTask = task;
        seenOptions = options;
        return runResult({
          ok: true,
          agentId: 'keil',
          output: JSON.stringify({ ok: true, projectPath, warningCount: 0, errorCount: 0 }),
          status: 'succeeded',
          handoff: { required: false },
        });
      },
    }, store);
    const out = await skill.execute(
      {
        query: `请编译 Keil 工程 ${projectPath}`,
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mcpWorkflowApproved: true, minimumObservedAt: 0, completedRevisionCycles: 0 },
      },
      deps,
    );
    assert.equal(seenTask, '构建 Keil 工程');
    assert.equal(seenOptions?.toolName, 'keil.BuildProject');
    assert.equal(seenOptions?.opKind, 'compile');
    assert.equal(seenOptions?.retryCount, 0);
    assert.match(String(out.result), /构建已完成/);
    assert.equal(out.artifacts?.[0]?.kind, 'mcp-domain-workflow');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mcp-agent: E408 画像缺失时先执行只读 Keil 盘点，不直接 build', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-agent-inventory-'));
  const projectPath = join(root, 'demo.uvprojx');
  const store = new ProjectProfileStore(join(root, 'profiles'));
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  try {
    const deps = depsWithSubAgent({
      dispatch: async (_task, options) => {
        seenOptions = options;
        return runResult({
          ok: true,
          agentId: 'keil',
          output: JSON.stringify({ profile: { projectId: 'project-0123456789abcdef', projectRoot: root, platform: null, chip: null, targets: [], selectedTarget: null } }),
          status: 'succeeded',
          handoff: { required: false },
        });
      },
    }, store);
    const out = await skill.execute(
      { query: `请编译 Keil 工程 ${projectPath}`, attachmentSignals: [], rawFiles: [], memory: null },
      deps,
    );
    assert.equal(seenOptions?.toolName, 'keil.InspectProjectProfile');
    assert.equal(seenOptions?.deterministic, true);
    assert.equal(seenOptions?.opKind, undefined);
    assert.match(String(out.result), /只读盘点已完成/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mcp-agent: 无路径 Keil 请求先走只读工程发现', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenOptions = options;
      return runResult({
        ok: true,
        agentId: 'keil',
        output: JSON.stringify({ projects: ['projects\\a.uvprojx'], count: 1 }),
        status: 'succeeded',
        handoff: { required: false },
      });
    },
  });
  const out = await skill.execute(
    { query: '帮我查找 Keil 工程', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(seenOptions?.toolName, 'keil.DiscoverProjects');
  assert.deepEqual(seenOptions?.args, { root: 'projects' });
  assert.match(String(out.result), /找到 1 个 Keil 工程/);
});

test('mcp-agent: 带工程路径的 target 查询只读映射并返回结构化产物', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenOptions = options;
      return runResult({
        ok: true,
        agentId: 'keil',
        output: JSON.stringify({ projectPath: 'projects\\demo.uvprojx', targets: ['Debug', 'Release'], count: 2 }),
        status: 'succeeded',
        handoff: { required: false },
      });
    },
  });
  const out = await skill.execute(
    { query: '查看 projects\\demo.uvprojx 有哪些 target', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(seenOptions?.toolName, 'keil.ListTargets');
  assert.deepEqual(seenOptions?.args, { projectPath: 'projects\\demo.uvprojx' });
  assert.equal(seenOptions?.deterministic, true);
  assert.match(String(out.result), /Debug/);
  assert.equal(out.artifacts?.[0]?.kind, 'keil-targets');
  assert.deepEqual(out.artifacts?.[0]?.data.targets, ['Debug', 'Release']);
});

test('mcp-agent: 项目画像请求映射到 Keil 只读盘点并返回缓存产物', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenOptions = options;
      return runResult({
        ok: true,
        agentId: 'keil',
        output: JSON.stringify({
          profile: {
            projectId: 'project-0123456789abcdef',
            projectRoot: 'M:\\repo\\projects\\demo',
            platform: 'keil-mdk',
            chip: 'STM32F103C8',
            targets: ['Debug'],
            selectedTarget: 'Debug',
          },
          profilePath: 'M:\\repo\\data\\project-profiles\\project-0123456789abcdef.json',
        }),
        status: 'succeeded',
        handoff: { required: false },
      });
    },
  });
  const out = await skill.execute(
    { query: '盘点 projects\\demo.uvprojx 的项目画像', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(seenOptions?.toolName, 'keil.InspectProjectProfile');
  assert.deepEqual(seenOptions?.args, { projectPath: 'projects\\demo.uvprojx' });
  assert.equal(seenOptions?.deterministic, true);
  assert.match(String(out.result), /STM32F103C8/);
  assert.equal(out.artifacts?.[0]?.kind, 'keil-project-profile');
});

test('mcp-agent: VS Code 配置请求映射到只读工作区盘点', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenOptions = options;
      return runResult({
        ok: true,
        agentId: 'vscode',
        output: JSON.stringify({
          workspaceRoot: 'M:\\repo\\projects\\demo',
          tasks: [{ label: 'Build', problemMatchers: ['$gcc'], hasCommand: true }],
          cppConfigurations: [{ name: 'ARM GCC' }],
          diagnosticMatchers: ['$gcc'],
          configurationDiagnostics: [],
          liveDiagnosticsAvailable: false,
        }),
        status: 'succeeded',
        handoff: { required: false },
      });
    },
  });
  const out = await skill.execute(
    { query: '盘点 VS Code 项目 projects\\demo 的配置和诊断', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(seenOptions?.toolName, 'vscode.InspectWorkspace');
  assert.deepEqual(seenOptions?.args, { root: 'projects\\demo' });
  assert.equal(seenOptions?.deterministic, true);
  assert.match(String(out.result), /实时编辑器诊断：未接入/);
  assert.equal(out.artifacts?.[0]?.kind, 'vscode-workspace-profile');
});

test('mcp-agent: 无盘点意图的 VS Code 请求只发现工作区', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenOptions = options;
      return runResult({
        ok: true,
        agentId: 'vscode',
        output: JSON.stringify({ workspaces: ['projects\\demo'], count: 1 }),
        status: 'succeeded',
        handoff: { required: false },
      });
    },
  });
  const out = await skill.execute(
    { query: '帮我查找 VS Code 工作区', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(seenOptions?.toolName, 'vscode.DiscoverWorkspaces');
  assert.deepEqual(seenOptions?.args, { root: 'projects' });
  assert.match(String(out.result), /找到 1 个 VS Code 工作区/);
});

test('mcp-agent: STM32-GCC 画像请求走只读盘点', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({ dispatch: async (_task, options) => {
    seenOptions = options;
    return runResult({ ok: true, agentId: 'stm32-gcc', output: JSON.stringify({ profile: { projectId: 'project-0123456789abcdef', projectRoot: 'M:\\repo\\projects\\demo', platform: 'stm32-gcc-cmake', chip: 'STM32F103xB', targets: ['firmware'], selectedTarget: 'firmware' }, profilePath: 'profile.json' }), status: 'succeeded', handoff: { required: false } });
  } });
  const out = await skill.execute({ query: '盘点 STM32-GCC 项目 projects\\demo 的画像', attachmentSignals: [], rawFiles: [], memory: null }, deps);
  assert.equal(seenOptions?.toolName, 'stm32-gcc.InspectProjectProfile');
  assert.equal(seenOptions?.deterministic, true);
  assert.equal(out.artifacts?.[0]?.kind, 'stm32-gcc-project-profile');
});

test('mcp-agent: KiCad 自然语言请求路由到 EDA 只读发现', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenOptions = options;
      return runResult({
        ok: true,
        agentId: 'kicad',
        output: JSON.stringify({ platform: 'kicad', projects: ['projects/demo.kicad_pro'], count: 1 }),
        status: 'succeeded',
        handoff: { required: false },
      });
    },
  });
  const out = await skill.execute(
    { query: '帮我查找 KiCad 工程', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(seenOptions?.toolName, 'kicad.DiscoverProjects');
  assert.deepEqual(seenOptions?.args, { root: 'projects' });
  assert.equal(seenOptions?.category, 'eda');
  assert.equal(seenOptions?.deterministic, true);
  assert.equal(seenOptions?.opKind, undefined);
  assert.match(String(out.result), /找到 1 个 KiCad 工程/);
});

test('mcp-agent: LTspice 自然语言请求路由到仿真只读盘点', async () => {
  let seenOptions: Parameters<NonNullable<SkillDeps['subAgent']>['dispatch']>[1];
  const deps = depsWithSubAgent({
    dispatch: async (_task, options) => {
      seenOptions = options;
      return runResult({
        ok: true,
        agentId: 'ltspice',
        output: JSON.stringify({
          schematicPath: 'projects/analog/demo.asc',
          componentCount: 2,
          simulationDirectives: ['.tran 0 1m'],
          includeDirectives: ['.include model.lib'],
          simulationExecuted: false,
        }),
        status: 'succeeded',
        handoff: { required: false },
      });
    },
  });
  const out = await skill.execute(
    { query: '盘点 LTspice 原理图 projects\\analog\\demo.asc', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(seenOptions?.toolName, 'ltspice.InspectSchematic');
  assert.deepEqual(seenOptions?.args, { schematicPath: 'projects\\analog\\demo.asc' });
  assert.equal(seenOptions?.category, 'simulation');
  assert.equal(seenOptions?.deterministic, true);
  assert.equal(seenOptions?.opKind, undefined);
  assert.match(String(out.result), /LTspice 原理图只读盘点/);
  assert.equal(out.artifacts?.[0]?.kind, 'ltspice-schematic-profile');
});

test('mcp-agent: E411 烧录请求走硬件门禁且不调用子 Agent', async () => {
  let dispatched = false;
  const deps: SkillDeps = {
    callVLM: async () => '',
    subAgent: {
      dispatch: async () => {
        dispatched = true;
        return runResult({ ok: true, agentId: 'keil', status: 'succeeded', handoff: { required: false } });
      },
    },
  };
  const out = await skill.execute(
    { query: '把固件烧录到板子', attachmentSignals: [], rawFiles: [], memory: null },
    deps,
  );
  assert.equal(dispatched, false);
  assert.match(String(out.result), /缺少设备标识|未在白名单|零硬件/);
  assert.equal(out.artifacts?.[0]?.kind, 'hardware-gate-decision');
});

test('mcp-agent: E411 无 subAgent 时串口请求仍返回门禁说明', async () => {
  const out = await skill.execute(
    {
      query: '读一下 COM3 串口日志',
      attachmentSignals: [],
      rawFiles: [],
      memory: null,
      params: { deviceId: 'UART-1' },
    },
    { callVLM: async () => '', deviceAuth: { isAuthorized: () => false } },
  );
  assert.match(String(out.result), /未在白名单|零硬件/);
  assert.equal(out.artifacts?.[0]?.kind, 'hardware-gate-decision');
});

test('mcp-agent: E413 KiCad 编辑未批准时挂起且零 MCP 调用', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-agent-kicad-edit-'));
  const plans = new WorkflowPlanStore(join(root, 'plans.jsonl'));
  let dispatched = false;
  try {
    const out = await skill.execute(
      {
        query: '请编辑 KiCad 原理图 projects/board/demo.kicad_sch 注解：E413',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      depsWithSubAgent({
        dispatch: async () => {
          dispatched = true;
          return runResult({ ok: true, agentId: 'kicad', status: 'succeeded', handoff: { required: false } });
        },
      }, undefined, plans),
    );
    assert.equal(dispatched, false);
    assert.match(String(out.result), /等待高风险确认|未修改任何文件/);
    assert.equal(out.artifacts?.[0]?.kind, 'mcp-domain-workflow-plan');
    assert.equal(plans.list()[0]?.status, 'pending_approval');
    assert.equal(plans.list()[0]?.plan.nodes[0]?.kind, 'kicad_edit');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mcp-agent: E413 LTspice 仿真批准后按计划执行', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mcp-agent-ltspice-sim-'));
  const plans = new WorkflowPlanStore(join(root, 'plans.jsonl'));
  const calls: string[] = [];
  try {
    const pending = await skill.execute(
      {
        query: '请对 LTspice projects/analog/demo.asc 做仿真',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
      },
      depsWithSubAgent({
        dispatch: async (_q, options) => {
          calls.push(String(options?.toolName));
          return runResult({
            ok: true,
            agentId: 'ltspice',
            status: 'succeeded',
            output: JSON.stringify({
              ok: true,
              simulationExecuted: true,
              schematicPath: 'projects/analog/demo.asc',
              batchArgs: ['-b', 'projects/analog/demo.asc'],
              outputFiles: [{ path: 'projects/analog/demo.raw', bytes: 4, sha256: 'abcd' }],
            }),
            handoff: { required: false },
          });
        },
      }, undefined, plans),
    );
    const fingerprint = String((pending.artifacts?.[0]?.data as { fingerprint?: string })?.fingerprint ?? '');
    assert.ok(fingerprint);
    const out = await skill.execute(
      {
        query: '请对 LTspice projects/analog/demo.asc 做仿真',
        attachmentSignals: [],
        rawFiles: [],
        memory: null,
        params: { mcpWorkflowApproved: true, workflowPlanFingerprint: fingerprint },
      },
      depsWithSubAgent({
        dispatch: async (_q, options) => {
          calls.push(String(options?.toolName));
          return runResult({
            ok: true,
            agentId: 'ltspice',
            status: 'succeeded',
            output: JSON.stringify({
              ok: true,
              simulationExecuted: true,
              schematicPath: 'projects/analog/demo.asc',
              batchArgs: ['-b', 'projects/analog/demo.asc'],
              outputFiles: [{ path: 'projects/analog/demo.raw', bytes: 4, sha256: 'abcd' }],
            }),
            handoff: { required: false },
          });
        },
      }, undefined, plans),
    );
    assert.deepEqual(calls, ['ltspice.RunSimulation']);
    assert.match(String(out.result), /LTspice 仿真已完成/);
    assert.equal(plans.list()[0]?.status, 'done');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
