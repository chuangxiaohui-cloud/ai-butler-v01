/** E408/E413/E424/E432/E433/E434/E436：MCP 领域任务统一规划入口；构建/EDA 写入/仿真/烧录必须显式批准；多平台只读盘点以 dependsOn 根并行；盘点后附平台消歧选项与跟进问句。 */

import { dirname, resolve } from 'node:path';

import type { DomainWorkflowNode, DomainWorkflowPlan } from './domain-workflow.js';
import { isHardwareFlashQuery } from './hardware-capability.js';
import type { FlashToolKind } from './flash-driver.js';
import { deriveProjectId, ProjectProfileStore, type ProjectProfilePlanningResult } from './project-profile-store.js';
import type { ProjectPlatformCapability } from './project-profile.js';
import type { KiCadBoundedEdit } from './kicad-edit.js';
import { normalizeLtspiceBatchFlags } from './ltspice.js';

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

export interface McpPlatformChoice {
  id: 'keil' | 'stm32-gcc';
  label: string;
  /** 用户下一轮构建问句可复用的提示 */
  hint: string;
}

export interface McpWorkflowEntryResult {
  status: McpWorkflowEntryStatus;
  message: string;
  plan?: DomainWorkflowPlan;
  /** E433：多平台盘点后供 UI/Skill 展示的构建平台选项 */
  platformChoices?: McpPlatformChoice[];
}

type ProfileReader = Pick<ProjectProfileStore, 'loadForPlanning'>;

/** E433：把 platformChoices 编成可读后续动作文案。 */
export function formatPlatformChoices(choices: McpPlatformChoice[] | undefined): string | undefined {
  if (!choices || choices.length === 0) return undefined;
  const lines = choices.map((item, index) => `${index + 1}. ${item.label}（${item.id}）：${item.hint}`);
  return `构建前请选择平台：\n${lines.join('\n')}`;
}

/** E434：UI/Skill 点击平台选项后生成可识别的构建跟进问句。 */
export function buildPlatformChoiceFollowUpQuery(
  choice: Pick<McpPlatformChoice, 'id'>,
  projectRoot?: string | null,
): string {
  const root = typeof projectRoot === 'string' && projectRoot.trim() ? projectRoot.trim() : '';
  const platform = choice.id === 'keil' ? 'Keil' : 'stm32-gcc';
  return root ? `请编译 ${platform} 工程 ${root}` : `请编译 ${platform} 工程`;
}

export function isMcpDomainBuildRequest(query: string): boolean {
  return /(?:构建|编译|\bbuild\b|\.BuildProject\b)/i.test(query)
    && /(?:keil|\.uvprojx|stm32-gcc|arm-none-eabi|stm32.{0,12}cmake)/i.test(query);
}

export function isMcpKicadEditRequest(query: string): boolean {
  return /(?:编辑|修改|追加注解|替换文本|\.EditSchematic\b|\.EditPcb\b)/i.test(query)
    && /(?:kicad|\.kicad_sch|\.kicad_pcb)/i.test(query);
}

export function isMcpLtspiceSimulateRequest(query: string): boolean {
  return /(?:仿真|simulate|\.RunSimulation\b|\b-b\b)/i.test(query)
    && /(?:ltspice|\.asc\b)/i.test(query);
}

/** E424：带沙箱固件路径的烧录意图 → 工作流计划（仍须独立 perFlashConfirmed）。 */
export function isMcpFlashRequest(query: string): boolean {
  return isHardwareFlashQuery(query) && extractFirmwarePath(query) !== null;
}

/** 需批准的领域写/重动作（构建、KiCad 编辑、LTspice 仿真、flash）。 */
export function isMcpDomainApprovalRequest(query: string): boolean {
  return isMcpDomainBuildRequest(query)
    || isMcpKicadEditRequest(query)
    || isMcpLtspiceSimulateRequest(query)
    || isMcpFlashRequest(query);
}

export function planMcpWorkflowEntry(
  request: McpWorkflowEntryRequest,
  store: ProfileReader = new ProjectProfileStore(),
): McpWorkflowEntryResult {
  validateRequest(request);
  // E411/E424：串口仍不进统一工作流；烧录走 hardware_flash 计划
  if (/(?:串口|serial\s*port|\bCOM\d+\b|tty(?:USB|ACM)\d+)/i.test(request.query)
    && !isHardwareFlashQuery(request.query)) {
    return {
      status: 'clarification_required',
      message: '统一工作流入口不接受串口执行计划；请走 E411/E421 硬件门禁（默认零打开）。',
    };
  }
  if (isMcpFlashRequest(request.query) || (isHardwareFlashQuery(request.query) && !isMcpDomainBuildRequest(request.query))) {
    return planFlash(request);
  }
  if (isMcpKicadEditRequest(request.query)) {
    return /\.kicad_pcb\b/i.test(request.query) || /\.EditPcb\b/i.test(request.query)
      ? planKicadPcbEdit(request)
      : planKicadEdit(request);
  }
  if (isMcpLtspiceSimulateRequest(request.query)) {
    return planLtspiceSimulate(request);
  }
  if (!/(?:构建|编译|\bbuild\b|\.BuildProject\b)/i.test(request.query)) {
    return { status: 'clarification_required', message: '当前统一入口只接受 Keil/STM32-GCC 构建、KiCad 原理图/PCB 有界编辑、LTspice 仿真或烧录任务。' };
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
    // E432：多平台未指定时先并行只读盘点各端；构建批准仍须随后明确平台
    const agents = loaded.profile.capabilities
      .map((item) => item.agentId)
      .filter((id): id is 'keil' | 'stm32-gcc' => id === 'keil' || id === 'stm32-gcc');
    return inventoryResult(
      request,
      location,
      projectId,
      '项目存在多个构建平台，先并行只读盘点；构建前请明确选择 Keil 或 STM32-GCC。',
      { agents, capabilities: loaded.profile.capabilities },
    );
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

/** pipeline 仅在画像已取证且确实将进入 build/写/仿真时建立裁决，不为盘点任务提前索要批准。 */
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
  if (!isMcpDomainApprovalRequest(query)) return null;
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

function planKicadEdit(request: McpWorkflowEntryRequest): McpWorkflowEntryResult {
  const schematicPath = extractKiCadSchematicPath(request.query);
  if (!schematicPath) {
    return { status: 'clarification_required', message: '请提供要编辑的 .kicad_sch 路径。' };
  }
  const edit = extractKiCadEdit(request.query);
  if (!edit) {
    return {
      status: 'clarification_required',
      message: '请提供有界编辑：追加注解（注解：…）或单次替换（替换：旧→新 / from→to）。',
    };
  }
  const resolved = resolve(schematicPath);
  const projectId = deriveProjectId(dirname(resolved));
  const node: DomainWorkflowNode = {
    id: 'kicad-edit',
    kind: 'kicad_edit',
    title: '编辑 KiCad 原理图（项目事务）',
    inputRefs: [resolved],
    outputKind: 'eda_edit',
    agentId: 'kicad',
    toolName: 'kicad.EditSchematic',
    args: { schematicPath: resolved, edit },
    targetFiles: [resolved],
    risk: 'write',
    acceptance: '事务提交成功且源文件哈希与提案一致',
    onFailure: 'handoff',
  };
  const plan = makePlan(projectId, request.completedRevisionCycles, [node]);
  return request.approved
    ? { status: 'ready', message: 'KiCad 编辑计划已批准，将经项目事务落盘。', plan }
    : { status: 'approval_required', message: 'KiCad 编辑计划已生成，等待高风险确认；当前未修改任何文件。', plan };
}

function planKicadPcbEdit(request: McpWorkflowEntryRequest): McpWorkflowEntryResult {
  const pcbPath = extractKiCadPcbPath(request.query);
  if (!pcbPath) {
    return { status: 'clarification_required', message: '请提供要编辑的 .kicad_pcb 路径。' };
  }
  const edit = extractKiCadEdit(request.query);
  if (!edit) {
    return {
      status: 'clarification_required',
      message: '请提供有界编辑：追加注解（注解：…）或单次替换（替换：旧→新 / from→to）。自由布线不在范围内。',
    };
  }
  const resolved = resolve(pcbPath);
  const projectId = deriveProjectId(dirname(resolved));
  const node: DomainWorkflowNode = {
    id: 'kicad-pcb-edit',
    kind: 'kicad_pcb_edit',
    title: '编辑 KiCad PCB（有界，项目事务）',
    inputRefs: [resolved],
    outputKind: 'eda_edit',
    agentId: 'kicad',
    toolName: 'kicad.EditPcb',
    args: { pcbPath: resolved, edit },
    targetFiles: [resolved],
    risk: 'write',
    acceptance: '事务提交成功且源文件哈希与提案一致',
    onFailure: 'handoff',
  };
  const plan = makePlan(projectId, request.completedRevisionCycles, [node]);
  return request.approved
    ? { status: 'ready', message: 'KiCad PCB 有界编辑计划已批准，将经项目事务落盘。', plan }
    : { status: 'approval_required', message: 'KiCad PCB 有界编辑计划已生成，等待高风险确认；当前未修改任何文件。', plan };
}

function planLtspiceSimulate(request: McpWorkflowEntryRequest): McpWorkflowEntryResult {
  const schematicPath = extractLtspicePath(request.query);
  if (!schematicPath) {
    return { status: 'clarification_required', message: '请提供要仿真的 .asc 路径。' };
  }
  let extraBatchFlags: string[] = [];
  try {
    extraBatchFlags = extractLtspiceBatchFlags(request.query);
  } catch (error) {
    return {
      status: 'clarification_required',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const resolved = resolve(schematicPath);
  const projectId = deriveProjectId(dirname(resolved));
  const node: DomainWorkflowNode = {
    id: 'ltspice-simulate',
    kind: 'ltspice_simulate',
    title: '运行 LTspice 批仿真',
    inputRefs: [resolved],
    outputKind: 'simulation_result',
    agentId: 'ltspice',
    toolName: 'ltspice.RunSimulation',
    args: {
      schematicPath: resolved,
      ...(extraBatchFlags.length ? { extraBatchFlags } : {}),
    },
    targetFiles: [resolved],
    risk: 'simulate',
    acceptance: '批仿真退出成功并报告沙箱内产物摘要',
    onFailure: 'handoff',
  };
  const plan = makePlan(projectId, request.completedRevisionCycles, [node]);
  const flagNote = extraBatchFlags.length ? `（含白名单开关 ${extraBatchFlags.join(' ')}）` : '';
  return request.approved
    ? { status: 'ready', message: `LTspice 仿真计划已批准，可以执行${flagNote}。`, plan }
    : { status: 'approval_required', message: `LTspice 仿真计划已生成${flagNote}，等待高风险确认；当前未启动仿真。`, plan };
}

function planFlash(request: McpWorkflowEntryRequest): McpWorkflowEntryResult {
  const firmwarePath = extractFirmwarePath(request.query);
  if (!firmwarePath) {
    return {
      status: 'clarification_required',
      message: '请提供沙箱内固件路径（projects/sandbox/outputs 下 .bin/.hex/.elf/.axf）。',
    };
  }
  const deviceId = extractDeviceId(request.query);
  if (!deviceId) {
    return {
      status: 'clarification_required',
      message: '请提供设备标识（设备：… / device=…）；默认无设备授权。',
    };
  }
  const toolKind = extractFlashToolKind(request.query);
  if (toolKind === 'openocd') {
    const openocdCfg = extractOpenocdBoardCfg(request.query);
    const iface = extractLabeled(request.query, /(?:interface|接口配置)[：:\s]+([^\s，。；]+)/i);
    const target = extractLabeled(request.query, /(?:target|目标配置)[：:\s]+([^\s，。；]+)/i);
    if (!openocdCfg && !(iface && target)) {
      return {
        status: 'clarification_required',
        message: 'openocd 须提供 board 配置（openocdCfg：board/….cfg）或 interface+target 配置。',
      };
    }
  }
  if (toolKind === 'jlink') {
    const jlinkDevice = extractLabeled(request.query, /(?:jlinkDevice|芯片|deviceName)[：:\s]+([A-Za-z0-9_-]+)/i)
      ?? (/STM32[A-Za-z0-9]+/i.exec(request.query)?.[0] ?? null);
    if (!jlinkDevice) {
      return {
        status: 'clarification_required',
        message: 'jlink 须提供芯片名（jlinkDevice：STM32…）。',
      };
    }
  }
  const resolved = resolve(firmwarePath);
  const projectId = deriveProjectId(dirname(resolved));
  const openocdCfg = extractOpenocdBoardCfg(request.query);
  const openocdInterfaceCfg = extractLabeled(request.query, /(?:interface|接口配置)[：:\s]+([^\s，。；]+)/i);
  const openocdTargetCfg = extractLabeled(request.query, /(?:target|目标配置)[：:\s]+([^\s，。；]+)/i);
  const jlinkDevice = extractLabeled(request.query, /(?:jlinkDevice|芯片|deviceName)[：:\s]+([A-Za-z0-9_-]+)/i)
    ?? (/STM32[A-Za-z0-9]+/i.exec(request.query)?.[0] ?? undefined);
  const node: DomainWorkflowNode = {
    id: 'hardware-flash',
    kind: 'hardware_flash',
    title: '受控烧录固件',
    inputRefs: [resolved],
    outputKind: 'flash_result',
    agentId: 'hardware',
    toolName: 'hardware.FlashFirmware',
    args: {
      firmwarePath: resolved,
      deviceId,
      flashToolKind: toolKind,
      ...(openocdCfg ? { openocdCfg } : {}),
      ...(openocdInterfaceCfg ? { openocdInterfaceCfg } : {}),
      ...(openocdTargetCfg ? { openocdTargetCfg } : {}),
      ...(jlinkDevice ? { jlinkDevice } : {}),
    },
    targetFiles: [resolved],
    risk: 'flash',
    acceptance: '门禁通过且烧录驱动 exit=0；工作流批准不能替代本次 perFlashConfirmed',
    onFailure: 'handoff',
  };
  const plan = makePlan(projectId, request.completedRevisionCycles, [node]);
  return request.approved
    ? {
      status: 'ready',
      message: '烧录计划已批准；执行前仍须本次独立 perFlashConfirmed 与 flashExecutable。',
      plan,
    }
    : {
      status: 'approval_required',
      message: '烧录计划已生成，等待高风险确认；当前未烧录。批准后仍须独立确认本次烧录。',
      plan,
    };
}

function extractFirmwarePath(query: string): string | null {
  return query.match(
    /((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.(?:bin|hex|elf|axf))\b/i,
  )?.[1]?.trim() ?? null;
}

function extractDeviceId(query: string): string | null {
  return extractLabeled(query, /(?:设备|deviceId|device)[：:=\s]+([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i);
}

function extractLabeled(query: string, re: RegExp): string | null {
  return query.match(re)?.[1]?.trim() ?? null;
}

function extractOpenocdBoardCfg(query: string): string | null {
  return extractLabeled(query, /(?:openocdCfg|board)[：:\s]+((?:board)\/[A-Za-z0-9._-]+\.cfg)/i);
}

function extractFlashToolKind(query: string): FlashToolKind {
  // 去掉「设备：xxx」片段，避免设备名（如 JLINK-1）被 \bjlink\b 误判为工具
  const withoutDevice = query.replace(
    /(?:设备|deviceId|device)[：:=\s]+[A-Za-z0-9][A-Za-z0-9._-]{0,63}/gi,
    ' ',
  );
  if (/\bopenocd\b/i.test(withoutDevice)) return 'openocd';
  if (/\bdfu-util\b|\bdfu\b/i.test(withoutDevice)) return 'dfu-util';
  // 显式工具名优先于 jlink（设备序列号常含 JLINK）
  if (/\bst-flash\b/i.test(withoutDevice)) return 'st-flash';
  if (/\bpyocd\b/i.test(withoutDevice)) return 'pyocd';
  if (/\bjlink\b|\bj-link\b/i.test(withoutDevice)) return 'jlink';
  return 'st-flash';
}

function extractKiCadSchematicPath(query: string): string | null {
  return query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.kicad_sch)/i)?.[1]?.trim() ?? null;
}

function extractKiCadPcbPath(query: string): string | null {
  return query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.kicad_pcb)/i)?.[1]?.trim() ?? null;
}

function extractLtspicePath(query: string): string | null {
  return query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.asc)/i)?.[1]?.trim() ?? null;
}

/** E419：从问句抽取可选批开关（开关：-ascii / flags: -ascii,-alt）。 */
function extractLtspiceBatchFlags(query: string): string[] {
  const matched = query.match(/(?:开关|批开关|flags?)[：:\s]+([^\r\n；;]+)/i)?.[1];
  if (!matched) return [];
  const tokens = matched
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return normalizeLtspiceBatchFlags(tokens);
}

function extractKiCadEdit(query: string): KiCadBoundedEdit | null {
  const annotation = query.match(/(?:注解|标注|append(?:_annotation)?)[：:\s]+["“]?([^"”\r\n]+)["”]?/i)?.[1]?.trim();
  if (annotation) return { kind: 'append_annotation', text: annotation };
  const arrow = query.match(/(?:替换|replace)[：:\s]+(.+?)\s*(?:→|->|=>)\s*(.+?)(?:[。；;\r\n]|$)/i);
  if (arrow?.[1] && arrow[2]) {
    return { kind: 'replace_text', from: arrow[1].trim().replace(/^["“]|["”]$/g, ''), to: arrow[2].trim().replace(/^["“]|["”]$/g, '') };
  }
  const fromTo = query.match(/\bfrom\s*=\s*["']([^"']+)["']\s*,?\s*to\s*=\s*["']([^"']+)["']/i);
  if (fromTo?.[1] && fromTo[2]) return { kind: 'replace_text', from: fromTo[1], to: fromTo[2] };
  return null;
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
  multi?: {
    agents: Array<'keil' | 'stm32-gcc'>;
    capabilities?: ProjectPlatformCapability[];
  },
): McpWorkflowEntryResult {
  const nodes = multi && multi.agents.length > 0
    ? multi.agents
      .map((agentId) => inventoryNode(enrichLocationForAgent(location, agentId, multi.capabilities)))
      .filter((node): node is DomainWorkflowNode => node !== null)
    : (() => {
      const single = inventoryNode(location);
      if (single) return [single];
      return (['keil', 'stm32-gcc'] as const)
        .map((agentId) => inventoryNode(enrichLocationForAgent(location, agentId, undefined)))
        .filter((node): node is DomainWorkflowNode => node !== null);
    })();
  if (nodes.length === 0) {
    return { status: 'clarification_required', message: `${message} 请明确平台与工程路径。` };
  }
  const tagged = tagReadonlyInventoryParallelGroup(nodes);
  const platformChoices = buildPlatformChoices(tagged);
  return {
    status: 'inventory_required',
    message,
    plan: makePlan(projectId, request.completedRevisionCycles, tagged),
    ...(platformChoices ? { platformChoices } : {}),
  };
}

function buildPlatformChoices(nodes: DomainWorkflowNode[]): McpPlatformChoice[] | undefined {
  const agents = [...new Set(
    nodes
      .filter((node) => node.risk === 'read_only' && (node.agentId === 'keil' || node.agentId === 'stm32-gcc'))
      .map((node) => node.agentId as 'keil' | 'stm32-gcc'),
  )];
  if (agents.length < 2) return undefined;
  return agents.map((id) => (
    id === 'keil'
      ? {
        id: 'keil' as const,
        label: 'Keil MDK',
        hint: '下一轮构建请写明「Keil」或指定 platform=keil',
      }
      : {
        id: 'stm32-gcc' as const,
        label: 'STM32-GCC / CMake',
        hint: '下一轮构建请写明「stm32-gcc」或指定 platform=stm32-gcc',
      }
  ));
}

/** 从画像能力补全 Keil .uvprojx 等盘点路径，便于多平台并行盘点。 */
function enrichLocationForAgent(
  location: ReturnType<typeof resolveLocation>,
  agentId: 'keil' | 'stm32-gcc',
  capabilities: ProjectPlatformCapability[] | undefined,
): ReturnType<typeof resolveLocation> {
  if (agentId === 'keil' && !location.projectPath && capabilities) {
    const args = capabilities.find((item) => item.agentId === 'keil')?.build?.args;
    const projectPath = typeof args?.projectPath === 'string' ? args.projectPath : null;
    if (projectPath) {
      return { ...location, platform: 'keil', projectPath: resolve(projectPath) };
    }
  }
  return { ...location, platform: agentId };
}

function inventoryNode(location: ReturnType<typeof resolveLocation>): DomainWorkflowNode | null {
  if (location.platform === 'keil' && location.projectPath) {
    return {
      id: 'inventory-keil', kind: 'project_inventory', title: '盘点 Keil 项目画像', inputRefs: [location.projectPath],
      outputKind: 'project_profile', agentId: 'keil', toolName: 'keil.InspectProjectProfile',
      args: { projectPath: location.projectPath }, targetFiles: [location.projectPath], risk: 'read_only',
      acceptance: '画像通过 schema 校验并写入证据缓存', onFailure: 'handoff',
    };
  }
  if (location.platform === 'stm32-gcc' && location.projectRoot) {
    return {
      id: 'inventory-stm32', kind: 'stm32_project_inventory', title: '盘点 STM32-GCC 项目画像', inputRefs: [location.projectRoot],
      outputKind: 'project_profile', agentId: 'stm32-gcc', toolName: 'stm32-gcc.InspectProjectProfile',
      args: { root: location.projectRoot }, targetFiles: [location.projectRoot], risk: 'read_only',
      acceptance: '画像通过 schema 校验并写入证据缓存', onFailure: 'handoff',
    };
  }
  return null;
}

/** E432/E436：≥2 个只读盘点打 dependsOn:[] 作 DAG 根并行；单节点不加。 */
function tagReadonlyInventoryParallelGroup(nodes: DomainWorkflowNode[]): DomainWorkflowNode[] {
  const inventoryKinds = new Set([
    'project_inventory',
    'workspace_inventory',
    'stm32_project_inventory',
    'kicad_project_inventory',
    'ltspice_schematic_inventory',
  ]);
  const readonlyInventories = nodes.filter(
    (node) => node.risk === 'read_only' && inventoryKinds.has(node.kind),
  );
  if (readonlyInventories.length < 2) return nodes;
  return nodes.map((node) => (
    node.risk === 'read_only' && inventoryKinds.has(node.kind)
      ? { ...node, dependsOn: [], parallelGroup: undefined }
      : node
  ));
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
