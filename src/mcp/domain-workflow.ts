/** E404/E409：领域工作流执行入口；电子设计节点保持只读边界。 */

import type { DispatchOptions, DispatchResult } from './dispatcher.js';
import { checkRevisionLoop } from './workflow-guard.js';

export type DomainWorkflowNodeKind =
  | 'project_inventory'
  | 'workspace_inventory'
  | 'build'
  | 'stm32_project_inventory'
  | 'stm32_build'
  | 'kicad_project_inventory'
  | 'kicad_erc'
  | 'ltspice_schematic_inventory';
export type DomainWorkflowNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface DomainWorkflowNode {
  id: string;
  kind: DomainWorkflowNodeKind;
  title: string;
  inputRefs: string[];
  outputKind: 'project_profile' | 'vscode_workspace' | 'build_diagnostics' | 'eda_project' | 'erc_diagnostics' | 'simulation_profile';
  agentId: 'keil' | 'vscode' | 'stm32-gcc' | 'kicad' | 'ltspice';
  toolName:
    | 'keil.InspectProjectProfile'
    | 'vscode.InspectWorkspace'
    | 'keil.BuildProject'
    | 'stm32-gcc.InspectProjectProfile'
    | 'stm32-gcc.BuildProject'
    | 'kicad.InspectProject'
    | 'kicad.RunErc'
    | 'ltspice.InspectSchematic';
  args: Record<string, unknown>;
  targetFiles: string[];
  risk: 'read_only' | 'build';
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
  ltspice_schematic_inventory: {
    toolName: 'ltspice.InspectSchematic',
    outputKind: 'simulation_profile',
    risk: 'read_only',
  },
};

export async function executeDomainWorkflow(
  plan: DomainWorkflowPlan,
  dispatcher: DomainWorkflowDispatcher,
): Promise<DomainWorkflowResult> {
  validatePlan(plan);
  const nodes: DomainWorkflowResult['nodes'] = plan.nodes.map((node) => ({
    ...node,
    status: 'pending',
  }));
  const artifacts: DomainWorkflowArtifact[] = [];
  const evidence: DomainWorkflowEvidence[] = [];

  if (nodes.some((node) => node.risk === 'build')) {
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
    const dispatched = await dispatcher.dispatch(node.title, {
      toolName: node.toolName,
      args: node.args,
      category: node.agentId === 'vscode'
        ? 'code'
        : node.agentId === 'kicad' ? 'eda' : node.agentId === 'ltspice' ? 'simulation' : 'build',
      ...(node.risk === 'build'
        ? { opKind: 'compile', retryCount: 0 }
        : { deterministic: true }),
    });
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
        : node.kind.startsWith('kicad_') ? 'kicad' : node.kind.startsWith('ltspice_') ? 'ltspice' : 'keil';
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
