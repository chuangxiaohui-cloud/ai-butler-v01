/** E404/E409/E413/E424/E431/E435：领域工作流执行入口；写入/仿真/烧录节点须已在入口层完成批准；E431 只读并行组；E435 有界 dependsOn DAG。 */

import type { DispatchOptions, DispatchResult } from './dispatcher.js';
import { computeFirmwareDigest } from './firmware-digest.js';
import {
  isFlashToolKind,
  runAuthorizedFlash,
  type FlashRunner,
  type FlashToolKind,
} from './flash-driver.js';
import { evaluateHardwareGate } from './hardware-gate.js';
import type { DeviceAuthStore } from './device-auth.js';
import { checkRevisionLoop } from './workflow-guard.js';

export type DomainWorkflowNodeKind =
  | 'project_inventory'
  | 'workspace_inventory'
  | 'build'
  | 'stm32_project_inventory'
  | 'stm32_build'
  | 'kicad_project_inventory'
  | 'kicad_erc'
  | 'kicad_edit'
  | 'kicad_pcb_edit'
  | 'ltspice_schematic_inventory'
  | 'ltspice_simulate'
  | 'hardware_flash';
export type DomainWorkflowNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';

export interface DomainWorkflowNode {
  id: string;
  kind: DomainWorkflowNodeKind;
  title: string;
  inputRefs: string[];
  outputKind:
    | 'project_profile'
    | 'vscode_workspace'
    | 'build_diagnostics'
    | 'eda_project'
    | 'erc_diagnostics'
    | 'eda_edit'
    | 'simulation_profile'
    | 'simulation_result'
    | 'flash_result';
  agentId: 'keil' | 'vscode' | 'stm32-gcc' | 'kicad' | 'ltspice' | 'hardware';
  toolName:
    | 'keil.InspectProjectProfile'
    | 'vscode.InspectWorkspace'
    | 'keil.BuildProject'
    | 'stm32-gcc.InspectProjectProfile'
    | 'stm32-gcc.BuildProject'
    | 'kicad.InspectProject'
    | 'kicad.RunErc'
    | 'kicad.EditSchematic'
    | 'kicad.EditPcb'
    | 'ltspice.InspectSchematic'
    | 'ltspice.RunSimulation'
    | 'hardware.FlashFirmware';
  args: Record<string, unknown>;
  targetFiles: string[];
  risk: 'read_only' | 'build' | 'write' | 'simulate' | 'flash';
  acceptance: string;
  onFailure: 'handoff' | 'revise';
  /**
   * E431：只读并行组。相邻且同名的 read_only 节点同一波次 Promise.all；
   * build/write/simulate/flash 禁止带此字段。
   * 与 dependsOn 互斥：同一计划不得混用。
   */
  parallelGroup?: string;
  /**
   * E435/E436：有界依赖边（节点 id）。`dependsOn` 字段出现即启用 Kahn 拓扑波次；
   * 空数组表示 DAG 根（对等只读可同首波并行）；禁止环、禁止与 parallelGroup 混用；
   * 同波若 >1 个节点则必须全为 read_only。
   */
  dependsOn?: string[];
}

export interface DomainWorkflowPlan {
  id: string;
  projectId: string;
  completedRevisionCycles: number;
  nodes: DomainWorkflowNode[];
}

export interface DomainWorkflowArtifact {
  nodeId: string;
  kind: DomainWorkflowNode['outputKind'];
  content: string;
  data: unknown;
  untrusted: true;
}

export interface DomainWorkflowEvidence {
  nodeId: string;
  kind: 'mcp_tool_call';
  agentId: string;
  toolName: string;
  attempt: number;
  untrusted: true;
}

export interface DomainWorkflowResult {
  ok: boolean;
  workflowId: string;
  projectId: string;
  status: 'succeeded' | 'failed' | 'blocked';
  nodes: Array<DomainWorkflowNode & { status: DomainWorkflowNodeStatus; error?: string }>;
  artifacts: DomainWorkflowArtifact[];
  evidence: DomainWorkflowEvidence[];
  handoff: {
    required: boolean;
    reason?: string;
    nextAction?: string;
    requiredEvidence?: Array<'serial_log' | 'recent_diff'>;
  };
}

export interface DomainWorkflowDispatcher {
  dispatch(task: string, options?: DispatchOptions): Promise<DispatchResult>;
}

/** E424：烧录节点本地执行依赖（不经 MCP stdio）。 */
export interface DomainWorkflowHardwareDeps {
  devices: Pick<DeviceAuthStore, 'isAuthorized'>;
  flashRunner?: FlashRunner;
}

export interface DomainWorkflowExecuteOptions {
  hardware?: DomainWorkflowHardwareDeps;
}

const NODE_CONTRACT: Record<DomainWorkflowNodeKind, {
  toolName: DomainWorkflowNode['toolName'];
  outputKind: DomainWorkflowNode['outputKind'];
  risk: DomainWorkflowNode['risk'];
}> = {
  project_inventory: {
    toolName: 'keil.InspectProjectProfile',
    outputKind: 'project_profile',
    risk: 'read_only',
  },
  workspace_inventory: {
    toolName: 'vscode.InspectWorkspace',
    outputKind: 'vscode_workspace',
    risk: 'read_only',
  },
  build: {
    toolName: 'keil.BuildProject',
    outputKind: 'build_diagnostics',
    risk: 'build',
  },
  stm32_project_inventory: {
    toolName: 'stm32-gcc.InspectProjectProfile',
    outputKind: 'project_profile',
    risk: 'read_only',
  },
  stm32_build: {
    toolName: 'stm32-gcc.BuildProject',
    outputKind: 'build_diagnostics',
    risk: 'build',
  },
  kicad_project_inventory: {
    toolName: 'kicad.InspectProject',
    outputKind: 'eda_project',
    risk: 'read_only',
  },
  kicad_erc: {
    toolName: 'kicad.RunErc',
    outputKind: 'erc_diagnostics',
    risk: 'read_only',
  },
  kicad_edit: {
    toolName: 'kicad.EditSchematic',
    outputKind: 'eda_edit',
    risk: 'write',
  },
  kicad_pcb_edit: {
    toolName: 'kicad.EditPcb',
    outputKind: 'eda_edit',
    risk: 'write',
  },
  ltspice_schematic_inventory: {
    toolName: 'ltspice.InspectSchematic',
    outputKind: 'simulation_profile',
    risk: 'read_only',
  },
  ltspice_simulate: {
    toolName: 'ltspice.RunSimulation',
    outputKind: 'simulation_result',
    risk: 'simulate',
  },
  hardware_flash: {
    toolName: 'hardware.FlashFirmware',
    outputKind: 'flash_result',
    risk: 'flash',
  },
};

export async function executeDomainWorkflow(
  plan: DomainWorkflowPlan,
  dispatcher: DomainWorkflowDispatcher,
  options?: DomainWorkflowExecuteOptions,
): Promise<DomainWorkflowResult> {
  validatePlan(plan);
  const nodes: DomainWorkflowResult['nodes'] = plan.nodes.map((node) => ({
    ...node,
    status: 'pending',
  }));
  const artifacts: DomainWorkflowArtifact[] = [];
  const evidence: DomainWorkflowEvidence[] = [];

  if (nodes.some((node) =>
    node.risk === 'build' || node.risk === 'write' || node.risk === 'simulate' || node.risk === 'flash'
  )) {
    const loop = checkRevisionLoop(plan.completedRevisionCycles);
    if (!loop.allowed) {
      for (const node of nodes) node.status = 'skipped';
      return {
        ok: false,
        workflowId: plan.id,
        projectId: plan.projectId,
        status: 'blocked',
        nodes,
        artifacts,
        evidence,
        handoff: {
          required: true,
          reason: loop.handoff!.reason,
          nextAction: '携带串口日志与最近 diff 交由用户审查。',
          requiredEvidence: [...loop.handoff!.requiredEvidence],
        },
      };
    }
  }

  const waves = planUsesDependencyEdges(plan.nodes)
    ? partitionDependencyWaves(nodes)
    : partitionWaves(nodes);
  for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
    const wave = waves[waveIndex]!;
    const waveOutcomes = await Promise.all(wave.map(async (node) => {
      node.status = 'running';
      const dispatched = node.kind === 'hardware_flash'
        ? await executeHardwareFlashNode(node, options?.hardware)
        : await dispatcher.dispatch(node.title, {
          toolName: node.toolName,
          args: node.args,
          category: node.agentId === 'vscode'
            ? 'code'
            : node.agentId === 'kicad' ? 'eda' : node.agentId === 'ltspice' ? 'simulation' : 'build',
          ...(node.risk === 'build'
            ? { opKind: 'compile' as const, retryCount: 0 }
            : node.risk === 'write'
              ? { opKind: 'filegen' as const, retryCount: 0 }
              : node.risk === 'simulate'
                ? { opKind: 'compile' as const, retryCount: 0 }
                : { deterministic: true }),
        });
      return { node, dispatched };
    }));

    // 按计划顺序合并证据，避免 Promise.all 完成先后打乱可读性
    let waveFailed: { node: DomainWorkflowResult['nodes'][number]; error: string } | null = null;
    for (const { node, dispatched } of waveOutcomes) {
      evidence.push(...dispatched.evidence.map((item) => ({ ...item, nodeId: node.id })));
      if (dispatched.output) {
        artifacts.push({
          nodeId: node.id,
          kind: node.outputKind,
          content: dispatched.output,
          data: parseArtifactData(dispatched.output),
          untrusted: true,
        });
      }
      if (!dispatched.ok) {
        node.status = 'failed';
        node.error = dispatched.error ?? '节点执行失败';
        if (!waveFailed) waveFailed = { node, error: node.error };
      } else {
        node.status = 'completed';
      }
    }

    if (waveFailed) {
      cascadeAfterFailure(nodes);
      return {
        ok: false,
        workflowId: plan.id,
        projectId: plan.projectId,
        status: 'failed',
        nodes,
        artifacts,
        evidence,
        handoff: {
          required: true,
          reason: waveFailed.error,
          nextAction: waveFailed.node.onFailure === 'revise' ? '修订后重新规划下一轮。' : '交由用户审查。',
        },
      };
    }
  }

  return {
    ok: true,
    workflowId: plan.id,
    projectId: plan.projectId,
    status: 'succeeded',
    nodes,
    artifacts,
    evidence,
    handoff: { required: false },
  };
}

async function executeHardwareFlashNode(
  node: DomainWorkflowNode,
  hardware: DomainWorkflowHardwareDeps | undefined,
): Promise<DispatchResult> {
  const base = (overrides: Partial<DispatchResult>): DispatchResult => ({
    ok: false,
    agentId: 'hardware',
    output: '',
    untrusted: true,
    attempts: 1,
    elapsedMs: 0,
    degraded: false,
    task: { description: node.title, requestedTool: 'hardware.FlashFirmware', category: 'build' },
    status: 'failed',
    plan: [],
    progress: [],
    artifacts: [],
    evidence: [],
    handoff: { required: true },
    ...overrides,
  });

  if (!hardware?.devices) {
    return base({ error: '烧录节点缺少硬件门禁依赖（deviceAuth）' });
  }
  if (node.args.perFlashConfirmed !== true) {
    return base({
      error: '每次烧录须独立确认（perFlashConfirmed）；工作流批准不能复用为烧录确认。',
    });
  }
  const firmwarePath = typeof node.args.firmwarePath === 'string' ? node.args.firmwarePath : '';
  const deviceId = typeof node.args.deviceId === 'string' ? node.args.deviceId : '';
  const flashExecutable = typeof node.args.flashExecutable === 'string' ? node.args.flashExecutable : '';
  if (!firmwarePath || !deviceId || !flashExecutable) {
    return base({ error: '烧录节点缺少 firmwarePath / deviceId / flashExecutable' });
  }
  const digest = computeFirmwareDigest(firmwarePath);
  if (!digest.ok) {
    return base({ error: `固件摘要失败：${digest.reason}` });
  }
  const gate = evaluateHardwareGate(
    {
      action: 'flash',
      deviceId,
      port: typeof node.args.port === 'string' ? node.args.port : null,
      firmware: digest.digest,
      perFlashConfirmed: true,
    },
    { devices: hardware.devices },
  );
  if (!gate.allowed) {
    return base({ error: gate.message });
  }
  try {
    const toolKindRaw = node.args.flashToolKind;
    const flashResult = await runAuthorizedFlash({
      gate,
      firmwarePath: digest.digest.path,
      expectedSha256: digest.digest.sha256,
      executable: flashExecutable,
      ...(isFlashToolKind(toolKindRaw) ? { toolKind: toolKindRaw as FlashToolKind } : {}),
      ...(typeof node.args.flashAddress === 'string' ? { flashAddress: node.args.flashAddress } : {}),
      ...(typeof node.args.openocdCfg === 'string' ? { openocdCfg: node.args.openocdCfg } : {}),
      ...(typeof node.args.openocdInterfaceCfg === 'string'
        ? { openocdInterfaceCfg: node.args.openocdInterfaceCfg }
        : {}),
      ...(typeof node.args.openocdTargetCfg === 'string'
        ? { openocdTargetCfg: node.args.openocdTargetCfg }
        : {}),
      ...(typeof node.args.dfuAlt === 'number' ? { dfuAlt: node.args.dfuAlt } : {}),
      ...(typeof node.args.jlinkDevice === 'string' ? { jlinkDevice: node.args.jlinkDevice } : {}),
      ...(typeof node.args.jlinkInterface === 'string'
        ? { jlinkInterface: node.args.jlinkInterface as 'SWD' | 'JTAG' }
        : {}),
      ...(typeof node.args.jlinkSpeed === 'number' ? { jlinkSpeed: node.args.jlinkSpeed } : {}),
      ...(hardware.flashRunner ? { runner: hardware.flashRunner } : {}),
    });
    return base({
      ok: flashResult.ok,
      status: flashResult.ok ? 'succeeded' : 'failed',
      output: JSON.stringify(flashResult),
      error: flashResult.ok ? undefined : flashResult.message,
      evidence: [{
        kind: 'mcp_tool_call',
        agentId: 'hardware',
        toolName: 'FlashFirmware',
        attempt: 1,
        untrusted: true,
      }],
      handoff: { required: !flashResult.ok },
    });
  } catch (err) {
    return base({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function validatePlan(plan: DomainWorkflowPlan): void {
  if (!plan.id.trim() || !plan.projectId.trim()) throw new TypeError('workflow id 与 projectId 不能为空');
  if (!Number.isInteger(plan.completedRevisionCycles) || plan.completedRevisionCycles < 0) {
    throw new TypeError('completedRevisionCycles 必须是非负整数');
  }
  if (plan.nodes.length === 0) throw new TypeError('工作流至少包含一个节点');
  const ids = new Set<string>();
  /** 已结束的 parallelGroup：同名不得再次出现（须连续成波） */
  const closedGroups = new Set<string>();
  let openGroup: string | null = null;
  const usesDependsOn = planUsesDependencyEdges(plan.nodes);
  for (const node of plan.nodes) {
    if (!node.id.trim() || ids.has(node.id)) throw new TypeError('节点 id 必须非空且唯一');
    ids.add(node.id);
    const expected = NODE_CONTRACT[node.kind];
    const expectedAgent = node.kind === 'workspace_inventory'
      ? 'vscode'
      : node.kind.startsWith('stm32_')
        ? 'stm32-gcc'
        : node.kind.startsWith('kicad_')
          ? 'kicad'
          : node.kind.startsWith('ltspice_')
            ? 'ltspice'
            : node.kind.startsWith('hardware_')
              ? 'hardware'
              : 'keil';
    if (!expected || node.agentId !== expectedAgent || node.toolName !== expected.toolName
      || node.outputKind !== expected.outputKind || node.risk !== expected.risk) {
      throw new TypeError(`节点 ${node.id} 不符合 E404 工具契约`);
    }
    if (!node.acceptance.trim()) throw new TypeError(`节点 ${node.id} 缺少验收条件`);
    if (node.inputRefs.some((item) => !item.trim()) || node.targetFiles.some((item) => !item.trim())) {
      throw new TypeError(`节点 ${node.id} 的输入引用与目标文件不能包含空值`);
    }
    if (usesDependsOn && node.parallelGroup !== undefined) {
      throw new TypeError(`节点 ${node.id}：dependsOn 计划不得混用 parallelGroup`);
    }
    if (node.dependsOn !== undefined) {
      if (!Array.isArray(node.dependsOn)) {
        throw new TypeError(`节点 ${node.id} 的 dependsOn 必须是数组`);
      }
      const seenDeps = new Set<string>();
      for (const dep of node.dependsOn) {
        if (!dep.trim()) throw new TypeError(`节点 ${node.id} 的 dependsOn 不能包含空值`);
        if (dep === node.id) throw new TypeError(`节点 ${node.id} 不得依赖自身`);
        if (seenDeps.has(dep)) throw new TypeError(`节点 ${node.id} 的 dependsOn 重复引用 ${dep}`);
        seenDeps.add(dep);
      }
    }
    if (node.parallelGroup !== undefined) {
      const group = node.parallelGroup.trim();
      if (!group) throw new TypeError(`节点 ${node.id} 的 parallelGroup 不能为空`);
      if (node.risk !== 'read_only') {
        throw new TypeError(`节点 ${node.id}：仅 read_only 可进入 parallelGroup（禁止并行写/构建/仿真/烧录）`);
      }
      if (closedGroups.has(group)) {
        throw new TypeError(`parallelGroup "${group}" 必须连续；节点 ${node.id} 打断了同组`);
      }
      if (openGroup && openGroup !== group) {
        closedGroups.add(openGroup);
        openGroup = group;
      } else {
        openGroup = group;
      }
    } else if (openGroup) {
      closedGroups.add(openGroup);
      openGroup = null;
    }
  }
  if (usesDependsOn) {
    for (const node of plan.nodes) {
      for (const dep of node.dependsOn ?? []) {
        if (!ids.has(dep)) throw new TypeError(`节点 ${node.id} 依赖未知节点 ${dep}`);
      }
    }
    // 拓扑分层同时验环与同波写风险
    partitionDependencyWaves(plan.nodes.map((node) => ({ ...node, status: 'pending' as const })));
  }
}

function planUsesDependencyEdges(nodes: Array<Pick<DomainWorkflowNode, 'dependsOn'>>): boolean {
  return nodes.some((node) => node.dependsOn !== undefined);
}

/** E431：相邻同名 parallelGroup 合成一波；无组或不同组各自成波。 */
function partitionWaves(
  nodes: DomainWorkflowResult['nodes'],
): Array<DomainWorkflowResult['nodes']> {
  const waves: Array<DomainWorkflowResult['nodes']> = [];
  for (const node of nodes) {
    const group = node.parallelGroup?.trim() || null;
    const last = waves[waves.length - 1];
    if (group && last && last[0]?.parallelGroup?.trim() === group) {
      last.push(node);
    } else {
      waves.push([node]);
    }
  }
  return waves;
}

/**
 * E435：Kahn 分层。同层 >1 时必须全为 read_only（写锁）；
 * 返回的波次按计划声明顺序稳定排序，便于证据可读。
 */
function partitionDependencyWaves(
  nodes: DomainWorkflowResult['nodes'] | DomainWorkflowNode[],
): Array<DomainWorkflowResult['nodes']> {
  const byId = new Map(nodes.map((node) => [node.id, node as DomainWorkflowResult['nodes'][number]]));
  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, 0);
    children.set(node.id, []);
  }
  for (const node of nodes) {
    for (const dep of node.dependsOn ?? []) {
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      children.get(dep)!.push(node.id);
    }
  }
  const waves: Array<DomainWorkflowResult['nodes']> = [];
  let remaining = nodes.length;
  const ready = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  while (ready.length > 0) {
    const waveIds = [...ready];
    ready.length = 0;
    const wave = waveIds
      .map((id) => byId.get(id)!)
      .sort((a, b) => nodes.findIndex((n) => n.id === a.id) - nodes.findIndex((n) => n.id === b.id));
    if (wave.length > 1 && wave.some((node) => node.risk !== 'read_only')) {
      throw new TypeError('依赖 DAG 同波并行仅允许 read_only（禁止并行写/构建/仿真/烧录）');
    }
    waves.push(wave);
    remaining -= wave.length;
    for (const node of wave) {
      for (const childId of children.get(node.id) ?? []) {
        const next = (indegree.get(childId) ?? 0) - 1;
        indegree.set(childId, next);
        if (next === 0) ready.push(childId);
      }
    }
  }
  if (remaining > 0) throw new TypeError('dependsOn 存在环或不可达依赖，禁止执行');
  return waves;
}

/** 失败后：依赖失败节点的下游标 blocked，其余 pending 标 skipped。 */
function cascadeAfterFailure(nodes: DomainWorkflowResult['nodes']): void {
  const failedOrBlocked = new Set(
    nodes.filter((n) => n.status === 'failed' || n.status === 'blocked').map((n) => n.id),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (node.status !== 'pending') continue;
      const deps = node.dependsOn ?? [];
      if (deps.some((dep) => failedOrBlocked.has(dep))) {
        node.status = 'blocked';
        node.error = '上游依赖失败，跳过执行';
        failedOrBlocked.add(node.id);
        grew = true;
      }
    }
  }
  for (const node of nodes) {
    if (node.status === 'pending') node.status = 'skipped';
  }
}

function parseArtifactData(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}
