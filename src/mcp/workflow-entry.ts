/** E408：MCP 领域任务统一规划入口；画像先行，构建必须显式批准。 */

import { dirname, resolve } from 'node:path';

import type { DomainWorkflowNode, DomainWorkflowPlan } from './domain-workflow.js';
import { deriveProjectId, ProjectProfileStore, type ProjectProfilePlanningResult } from './project-profile-store.js';
import type { ProjectPlatformCapability } from './project-profile.js';

export type McpWorkflowEntryStatus =
  | 'clarification_required'
  | 'inventory_required'
  | 'approval_required'
  | 'ready';

export interface McpWorkflowEntryRequest {
  query: string;
  approved: boolean;
  minimumObservedAt: number;
  completedRevisionCycles: number;
  projectRoot?: string;
  projectPath?: string;
  platform?: 'keil' | 'stm32-gcc';
}

export interface McpWorkflowEntryResult {
  status: McpWorkflowEntryStatus;
  message: string;
  plan?: DomainWorkflowPlan;
}

type ProfileReader = Pick<ProjectProfileStore, 'loadForPlanning'>;

export function isMcpDomainBuildRequest(query: string): boolean {
  return /(?:构建|编译|\bbuild\b|\.BuildProject\b)/i.test(query)
    && /(?:keil|\.uvprojx|stm32-gcc|arm-none-eabi|stm32.{0,12}cmake)/i.test(query);
}

export function planMcpWorkflowEntry(
  request: McpWorkflowEntryRequest,
  store: ProfileReader = new ProjectProfileStore(),
): McpWorkflowEntryResult {
  validateRequest(request);
  if (!/(?:构建|编译|\bbuild\b|\.BuildProject\b)/i.test(request.query)) {
    return { status: 'clarification_required', message: '当前统一入口只接受 Keil 或 STM32-GCC 构建任务。' };
  }
  const location = resolveLocation(request);
  if (!location.projectRoot) {
    return { status: 'clarification_required', message: '请提供工程根目录；Keil 任务请提供 .uvprojx 路径。' };
  }
  const projectId = deriveProjectId(location.projectRoot);
  const loaded = store.loadForPlanning(projectId, request.minimumObservedAt);
  if (!loaded.ok) {
    if (loaded.reason !== '项目画像不存在') {
      return { status: 'clarification_required', message: `项目画像不可用：${loaded.reason}` };
    }
    return inventoryResult(request, location, projectId, '未找到项目画像，先执行只读盘点。');
  }
  const agentId = selectAgent(request.platform ?? location.platform, loaded);
  if (!agentId) {
    return { status: 'clarification_required', message: '项目存在多个构建平台，请明确选择 Keil 或 STM32-GCC。' };
  }
  if (loaded.reprobeRequired) {
    return inventoryResult(
      request,
      { ...location, platform: agentId },
      projectId,
      `项目画像已过期（${(loaded.staleFields ?? []).join('、')}），先重新只读盘点。`,
    );
  }
  const capability = loaded.profile.capabilities.find((item) => item.agentId === agentId);
  if (!capability?.build) {
    return inventoryResult(request, { ...location, platform: agentId }, projectId, '画像没有可验证的构建能力，先重新只读盘点。');
  }
  const buildNode = buildNodeFromCapability(capability, loaded.profile.projectRoot);
  if (!buildNode) {
    return { status: 'clarification_required', message: '画像中的构建工具不在 E404 白名单内，拒绝生成计划。' };
  }
  const plan = makePlan(projectId, request.completedRevisionCycles, [buildNode]);
  return request.approved
    ? { status: 'ready', message: '构建计划已批准，可以执行。', plan }
    : { status: 'approval_required', message: '构建计划已生成，等待用户批准；当前未执行任何构建。', plan };
}

/** pipeline 仅在画像已取证且确实将进入 build 时建立裁决，不为盘点任务提前索要批准。 */
export function mcpBuildApprovalRequired(
  query: string,
  store: ProfileReader = new ProjectProfileStore(),
): boolean {
  return preflightMcpBuildRequest(query, store)?.status === 'approval_required';
}

export function preflightMcpBuildRequest(
  query: string,
  store: ProfileReader = new ProjectProfileStore(),
): McpWorkflowEntryResult | null {
  if (!isMcpDomainBuildRequest(query)) return null;
  return planMcpWorkflowEntry({
    query,
    approved: false,
    minimumObservedAt: 0,
    completedRevisionCycles: 0,
  }, store);
}

export function describeMcpWorkflowPlan(plan: DomainWorkflowPlan): string {
  return plan.nodes.map((node, index) =>
    `${index + 1}. ${node.title}｜${node.agentId}.${node.toolName.split('.').at(-1)}｜风险：${node.risk}`,
  ).join('\n');
}

function validateRequest(request: McpWorkflowEntryRequest): void {
  if (!request.query.trim()) throw new TypeError('query 不能为空');
  if (!Number.isFinite(request.minimumObservedAt) || request.minimumObservedAt < 0) {
    throw new TypeError('minimumObservedAt 必须是非负时间戳');
  }
  if (!Number.isInteger(request.completedRevisionCycles) || request.completedRevisionCycles < 0) {
    throw new TypeError('completedRevisionCycles 必须是非负整数');
  }
}

function resolveLocation(request: McpWorkflowEntryRequest): {
  projectRoot: string | null;
  projectPath: string | null;
  platform: 'keil' | 'stm32-gcc' | null;
} {
  const projectPath = request.projectPath ?? extractKeilProjectPath(request.query);
  const mentionsKeil = projectPath !== null || /keil/i.test(request.query);
  const mentionsStm32Gcc = /stm32-gcc|arm-none-eabi|stm32.{0,12}cmake/i.test(request.query);
  const platform = request.platform
    ?? (mentionsKeil === mentionsStm32Gcc ? null : mentionsKeil ? 'keil' : 'stm32-gcc');
  const rawRoot = request.projectRoot ?? (projectPath ? dirname(projectPath) : extractProjectRoot(request.query));
  return {
    projectRoot: rawRoot ? resolve(rawRoot) : null,
    projectPath: projectPath ? resolve(projectPath) : null,
    platform,
  };
}

function extractKeilProjectPath(query: string): string | null {
  return query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.uvprojx)/i)?.[1]?.trim() ?? null;
}

function extractProjectRoot(query: string): string | null {
  const labeled = query.match(/(?:工程|项目|目录|root)[：:\s]+["“]?((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"”\s，。；]+)/i)?.[1];
  if (labeled) return labeled.trim();
  return query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\s，。；]+)/i)?.[1]?.trim() ?? null;
}

function selectAgent(
  requested: 'keil' | 'stm32-gcc' | null,
  loaded: Extract<ProjectProfilePlanningResult, { ok: true }>,
): 'keil' | 'stm32-gcc' | null {
  if (requested) return requested;
  const available = loaded.profile.capabilities
    .filter((item) => item.build !== null && (item.agentId === 'keil' || item.agentId === 'stm32-gcc'))
    .map((item) => item.agentId as 'keil' | 'stm32-gcc');
  return available.length === 1 ? available[0]! : null;
}

function inventoryResult(
  request: McpWorkflowEntryRequest,
  location: ReturnType<typeof resolveLocation>,
  projectId: string,
  message: string,
): McpWorkflowEntryResult {
  const node = inventoryNode(location);
  if (!node) {
    return { status: 'clarification_required', message: `${message} 请明确平台与工程路径。` };
  }
  return {
    status: 'inventory_required',
    message,
    plan: makePlan(projectId, request.completedRevisionCycles, [node]),
  };
}

function inventoryNode(location: ReturnType<typeof resolveLocation>): DomainWorkflowNode | null {
  if (location.platform === 'keil' && location.projectPath) {
    return {
      id: 'inventory', kind: 'project_inventory', title: '盘点 Keil 项目画像', inputRefs: [location.projectPath],
      outputKind: 'project_profile', agentId: 'keil', toolName: 'keil.InspectProjectProfile',
      args: { projectPath: location.projectPath }, targetFiles: [location.projectPath], risk: 'read_only',
      acceptance: '画像通过 schema 校验并写入证据缓存', onFailure: 'handoff',
    };
  }
  if (location.platform === 'stm32-gcc' && location.projectRoot) {
    return {
      id: 'inventory', kind: 'stm32_project_inventory', title: '盘点 STM32-GCC 项目画像', inputRefs: [location.projectRoot],
      outputKind: 'project_profile', agentId: 'stm32-gcc', toolName: 'stm32-gcc.InspectProjectProfile',
      args: { root: location.projectRoot }, targetFiles: [location.projectRoot], risk: 'read_only',
      acceptance: '画像通过 schema 校验并写入证据缓存', onFailure: 'handoff',
    };
  }
  return null;
}

function buildNodeFromCapability(capability: ProjectPlatformCapability, projectRoot: string): DomainWorkflowNode | null {
  const build = capability.build;
  if (!build) return null;
  if (capability.agentId === 'keil' && build.agentId === 'keil' && build.toolName === 'keil.BuildProject') {
    return {
      id: 'build', kind: 'build', title: '构建 Keil 工程', inputRefs: ['project_profile'], outputKind: 'build_diagnostics',
      agentId: 'keil', toolName: 'keil.BuildProject', args: { ...build.args }, targetFiles: [projectRoot], risk: 'build',
      acceptance: '退出状态成功且 error 为零', onFailure: 'revise',
    };
  }
  if (capability.agentId === 'stm32-gcc' && build.agentId === 'stm32-gcc' && build.toolName === 'stm32-gcc.BuildProject') {
    return {
      id: 'build', kind: 'stm32_build', title: '构建 STM32-GCC 工程', inputRefs: ['project_profile'], outputKind: 'build_diagnostics',
      agentId: 'stm32-gcc', toolName: 'stm32-gcc.BuildProject', args: { ...build.args }, targetFiles: [projectRoot], risk: 'build',
      acceptance: '退出状态成功且 error 为零', onFailure: 'revise',
    };
  }
  return null;
}

function makePlan(projectId: string, completedRevisionCycles: number, nodes: DomainWorkflowNode[]): DomainWorkflowPlan {
  return { id: `mcp-entry-${projectId}`, projectId, completedRevisionCycles, nodes };
}
