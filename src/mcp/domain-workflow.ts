/** E404/E409/E413/E424：领域工作流执行入口；写入/仿真/烧录节点须已在入口层完成批准。 */

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
export type DomainWorkflowNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

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

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!;
    node.status = 'running';

    let dispatched: DispatchResult;
    if (node.kind === 'hardware_flash') {
      dispatched = await executeHardwareFlashNode(node, options?.hardware);
    } else {
      dispatched = await dispatcher.dispatch(node.title, {
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
    }
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
      for (const pending of nodes.slice(index + 1)) pending.status = 'skipped';
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
          reason: node.error,
          nextAction: node.onFailure === 'revise' ? '修订后重新规划下一轮。' : '交由用户审查。',
        },
      };
    }
    node.status = 'completed';
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
  }
}

function parseArtifactData(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}
