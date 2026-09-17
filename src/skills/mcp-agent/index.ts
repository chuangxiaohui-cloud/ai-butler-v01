/**
 * Skill: mcp-agent（MCP 子 Agent 调度，E240 S3 真实接入）
 * 有可用子 Agent（真实 stdio MCP server，如 windows-mcp）时把查询 dispatch 到
 * 对应子 Agent 工具；返回一律标记 untrusted（§10，只读展示，不直接驱动动作）。
 * 支持显式工具调用语法 `windows.Process(mode=list,limit=5)`；未指定参数时
 * Process 工具默认只读 `mode=list`（§10：危险参数如 kill 默认拒绝）。
 * 无可用子 Agent 时诚实提示，不假装执行。
 */

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillArtifact } from '../registry.js';
import type { SkillDeps } from '../deps.js';
import { DeviceAuthStore } from '../../mcp/device-auth.js';
import { executeDomainWorkflow } from '../../mcp/domain-workflow.js';
import { computeFirmwareDigest } from '../../mcp/firmware-digest.js';
import {
  isFlashToolKind,
  runAuthorizedFlash,
} from '../../mcp/flash-driver.js';
import { runAuthorizedSerialRead } from '../../mcp/serial-driver.js';
import {
  isHardwareCapabilityQuery,
  isHardwareFlashQuery,
  validateFirmwareDigest,
  type FirmwareDigest,
} from '../../mcp/hardware-capability.js';
import { evaluateHardwareGate } from '../../mcp/hardware-gate.js';
import { fingerprintDomainWorkflowPlan, shortPlanFingerprint } from '../../mcp/workflow-plan-fingerprint.js';
import { WorkflowPlanStore } from '../../mcp/workflow-plan-store.js';
import { isMcpDomainApprovalRequest, isMcpFlashRequest, planMcpWorkflowEntry, formatPlatformChoices } from '../../mcp/workflow-entry.js';

/** 显式工具调用语法：`windows.Process` / `windows.Process(mode=list,limit=5)` */
const TOOL_REF_RE = /((?:windows|keil|stm32-gcc|vscode|kicad|altium|freecad|cursor|ltspice)\.[A-Za-z][A-Za-z0-9_.-]*)(?:\(([^)]*)\))?/i;

/** E240：`windows.Process` 未指定参数时的只读默认；kill 等危险模式默认拒绝 */
const DANGEROUS_ARGS: Array<[string, unknown]> = [['mode', 'kill']];

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  const args: Record<string, unknown> = {};
  for (const part of raw.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (/^-?\d+$/.test(val)) args[key] = Number(val);
    else if (val === 'true') args[key] = true;
    else if (val === 'false') args[key] = false;
    else args[key] = val;
  }
  return args;
}

export function createMcpAgentSkill(): ExecutableSkill {
  return {
    name: 'mcp-agent',
    version: '0.1.0',
    triggers: ['进程', '窗口', '桌面', '系统工具', '子agent', '子 Agent', 'mcp', 'windows.', 'keil', '.uvprojx', 'vscode', 'VS Code', 'STM32-GCC', 'arm-none-eabi', 'KiCad', '.kicad_sch', '.kicad_pro', 'LTspice', '.asc', '烧录', '串口', 'flash', '编辑原理图', '仿真'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      // E411/E420/E421：串口 / 显式 executeFlash 走硬件路径；带固件路径的烧录 NL 走 E424 工作流
      if (isHardwareCapabilityQuery(input.query)) {
        const isFlash = isHardwareFlashQuery(input.query);
        if (isFlash && input.params?.executeFlash !== true && isMcpFlashRequest(input.query)) {
          // 落入下方领域工作流规划
        } else {
        const devices = deps.deviceAuth ?? new DeviceAuthStore();
        let firmware: FirmwareDigest | null = null;
        if (isFlash) {
          if (typeof input.params?.firmwarePath === 'string') {
            const dig = computeFirmwareDigest(input.params.firmwarePath);
            if (dig.ok) firmware = dig.digest;
          } else if (validateFirmwareDigest(input.params?.firmware)) {
            firmware = input.params.firmware;
          }
        }
        const port = typeof input.params?.port === 'string' ? input.params.port : null;
        const decision = evaluateHardwareGate(
          {
            action: isFlash ? 'flash' : 'serial_read',
            deviceId: typeof input.params?.deviceId === 'string' ? input.params.deviceId : null,
            port,
            serialMode: 'read_only',
            firmware,
            perFlashConfirmed: input.params?.perFlashConfirmed === true,
            authorizationSource:
              typeof input.params?.authorizationSource === 'string'
                ? input.params.authorizationSource
                : null,
          },
          { devices },
        );

        // E420：门禁通过 + 显式 executeFlash + flashExecutable 才 spawn（可注入 runner）
        if (
          isFlash
          && decision.allowed
          && input.params?.executeFlash === true
          && typeof input.params?.flashExecutable === 'string'
          && firmware
        ) {
          try {
            const toolKindRaw = input.params?.flashToolKind;
            const flashResult = await runAuthorizedFlash({
              gate: decision,
              firmwarePath: firmware.path,
              expectedSha256: firmware.sha256,
              executable: input.params.flashExecutable,
              ...(isFlashToolKind(toolKindRaw) ? { toolKind: toolKindRaw } : {}),
              ...(typeof input.params?.flashAddress === 'string'
                ? { flashAddress: input.params.flashAddress }
                : {}),
              ...(typeof input.params?.openocdCfg === 'string'
                ? { openocdCfg: input.params.openocdCfg }
                : {}),
              ...(typeof input.params?.openocdInterfaceCfg === 'string'
                ? { openocdInterfaceCfg: input.params.openocdInterfaceCfg }
                : {}),
              ...(typeof input.params?.openocdTargetCfg === 'string'
                ? { openocdTargetCfg: input.params.openocdTargetCfg }
                : {}),
              ...(typeof input.params?.dfuAlt === 'number' ? { dfuAlt: input.params.dfuAlt } : {}),
              ...(typeof input.params?.jlinkDevice === 'string'
                ? { jlinkDevice: input.params.jlinkDevice }
                : {}),
              ...(typeof input.params?.jlinkInterface === 'string'
                ? { jlinkInterface: input.params.jlinkInterface as 'SWD' | 'JTAG' }
                : {}),
              ...(typeof input.params?.jlinkSpeed === 'number'
                ? { jlinkSpeed: input.params.jlinkSpeed }
                : {}),
              ...(deps.flashRunner ? { runner: deps.flashRunner } : {}),
            });
            return {
              result: `${decision.message}\n${flashResult.message}`,
              confidence: flashResult.ok ? 0.85 : 0.45,
              followUpAction: flashResult.ok
                ? '烧录已执行；请核对板端现象与驱动日志。'
                : '烧录未成功；检查工具路径、接线与固件摘要后重试（仍须每次独立确认）。',
              artifacts: [
                {
                  kind: 'hardware-gate-decision',
                  title: '硬件门禁裁决',
                  data: { decision },
                },
                {
                  kind: 'flash-execution',
                  title: 'Flash 执行结果',
                  data: { flashResult },
                },
              ],
            };
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            return {
              result: `${decision.message}\n烧录驱动拒绝执行：${reason}`,
              confidence: 0.35,
              followUpAction: '请核对固件路径/摘要、工具可执行文件与本次确认后再试。',
              artifacts: [{
                kind: 'hardware-gate-decision',
                title: '硬件门禁裁决',
                data: { decision, flashError: reason },
              }],
            };
          }
        }

        // E421：门禁通过 + 显式 executeSerialRead + port 才只读（可注入 reader；默认不打开）
        if (
          !isFlash
          && decision.allowed
          && input.params?.executeSerialRead === true
          && typeof port === 'string'
        ) {
          try {
            const serialResult = await runAuthorizedSerialRead({
              gate: decision,
              port,
              ...(typeof input.params?.baudRate === 'number' ? { baudRate: input.params.baudRate } : {}),
              ...(typeof input.params?.maxBytes === 'number' ? { maxBytes: input.params.maxBytes } : {}),
              ...(deps.serialReader ? { reader: deps.serialReader } : {}),
            });
            return {
              result: `${decision.message}\n${serialResult.message}`,
              confidence: serialResult.ok ? 0.85 : 0.45,
              followUpAction: serialResult.ok
                ? '串口只读已执行；请核对日志。写/发字节仍禁止。'
                : '串口只读未完成；检查端口授权与注入 reader 后重试。',
              artifacts: [
                {
                  kind: 'hardware-gate-decision',
                  title: '硬件门禁裁决',
                  data: { decision },
                },
                {
                  kind: 'serial-read-execution',
                  title: '串口只读结果',
                  data: { serialResult },
                },
              ],
            };
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            return {
              result: `${decision.message}\n串口驱动拒绝执行：${reason}`,
              confidence: 0.35,
              followUpAction: '请核对设备白名单、端口名、波特率白名单，并注入 SerialReader。',
              artifacts: [{
                kind: 'hardware-gate-decision',
                title: '硬件门禁裁决',
                data: { decision, serialError: reason },
              }],
            };
          }
        }

        return {
          result: decision.message,
          confidence: 0.75,
          followUpAction: decision.allowed
            ? (isFlash
              ? '门禁已通过；提供 flashExecutable 并将 executeFlash=true 后由 E420 驱动执行烧录。串口写仍禁止。'
              : '门禁已通过；提供 port 并将 executeSerialRead=true 后由 E421 只读（生产已注入 E425 serialport；未装可选依赖则执行时失败）。写/发字节仍禁止。')
            : '请先完成设备白名单授权，并提供固件摘要与本次独立确认；不得用 E410 夹具证据授权。',
          artifacts: [{
            kind: 'hardware-gate-decision',
            title: '硬件门禁裁决',
            data: { decision },
          }],
        };
        }
      }

      // E424：烧录工作流可无 MCP subAgent；其它领域动作仍需装配
      if (isMcpDomainApprovalRequest(input.query)) {
        const minimumObservedAt = typeof input.params?.minimumObservedAt === 'number'
          ? input.params.minimumObservedAt
          : 0;
        const completedRevisionCycles = typeof input.params?.completedRevisionCycles === 'number'
          ? input.params.completedRevisionCycles
          : 0;
        const planStore = deps.workflowPlans ?? new WorkflowPlanStore();
        const entry = planMcpWorkflowEntry({
          query: input.query,
          approved: input.params?.mcpWorkflowApproved === true,
          minimumObservedAt,
          completedRevisionCycles,
        }, deps.projectProfiles);
        if (!entry.plan || entry.status === 'clarification_required') {
          return { result: entry.message, confidence: 0.4, followUpAction: '补充工程路径、编辑内容、固件路径或明确构建/仿真/烧录目标。' };
        }
        if (entry.status === 'approval_required') {
          const saved = planStore.savePending({ query: input.query, plan: entry.plan });
          return {
            result: `${entry.message}\n计划指纹：${shortPlanFingerprint(saved.fingerprint)}`,
            confidence: 0.8,
            followUpAction: '请通过统一裁决入口批准后再执行写入/仿真/构建/烧录。',
            artifacts: [{
              kind: 'mcp-domain-workflow-plan',
              title: 'MCP 领域工作流计划',
              data: {
                entry,
                fingerprint: saved.fingerprint,
                fingerprintShort: shortPlanFingerprint(saved.fingerprint),
                planRecordId: saved.id,
              },
            }],
          };
        }
        // E412：批准恢复时若携带指纹，必须与当前重算计划一致，否则零 MCP 调用
        const expectedFingerprint = typeof input.params?.workflowPlanFingerprint === 'string'
          ? input.params.workflowPlanFingerprint
          : null;
        if (expectedFingerprint && entry.status === 'ready') {
          const verified = planStore.verifyForResume(expectedFingerprint, entry.plan);
          if (!verified.ok) {
            return {
              result: verified.message,
              confidence: 0.35,
              followUpAction: '请重新发起请求以生成新计划并再次批准。',
              artifacts: [{
                kind: 'mcp-domain-workflow-plan',
                title: 'MCP 领域工作流计划（指纹漂移）',
                data: {
                  entry,
                  fingerprint: fingerprintDomainWorkflowPlan(entry.plan),
                  expectedFingerprint,
                  resumeError: verified.reason,
                },
              }],
            };
          }
        }
        const flashOnly = entry.plan.nodes.every((node) => node.kind === 'hardware_flash');
        if (!flashOnly && !deps.subAgent) {
          return {
            result: 'MCP 子 Agent 调度未装配，无法执行系统/工具类操作。',
            confidence: 0.2,
            followUpAction: '配置 configs/mcp-agents.json 启用真实 MCP server 后可用。',
          };
        }
        if (flashOnly && entry.status === 'ready') {
          if (input.params?.perFlashConfirmed !== true) {
            return {
              result: `${entry.message}\n计划已批准，但仍须本次独立烧录确认（perFlashConfirmed=true）；不得复用工作流批准。`,
              confidence: 0.55,
              followUpAction: '设置 perFlashConfirmed=true 与 flashExecutable 后再次执行。',
              artifacts: [{
                kind: 'mcp-domain-workflow-plan',
                title: 'MCP 领域工作流计划（待烧录确认）',
                data: { entry, fingerprint: fingerprintDomainWorkflowPlan(entry.plan) },
              }],
            };
          }
          if (typeof input.params?.flashExecutable !== 'string') {
            return {
              result: `${entry.message}\n缺少 flashExecutable；无法执行烧录。`,
              confidence: 0.4,
              followUpAction: '提供 flash 工具可执行文件路径后再试。',
            };
          }
          for (const node of entry.plan.nodes) {
            if (node.kind !== 'hardware_flash') continue;
            node.args = {
              ...node.args,
              perFlashConfirmed: true,
              flashExecutable: input.params.flashExecutable,
              ...(typeof input.params.flashAddress === 'string'
                ? { flashAddress: input.params.flashAddress }
                : {}),
              ...(typeof input.params.dfuAlt === 'number' ? { dfuAlt: input.params.dfuAlt } : {}),
              ...(typeof input.params.jlinkSpeed === 'number' ? { jlinkSpeed: input.params.jlinkSpeed } : {}),
              ...(typeof input.params.jlinkInterface === 'string'
                ? { jlinkInterface: input.params.jlinkInterface }
                : {}),
              ...(typeof input.params.port === 'string' ? { port: input.params.port } : {}),
            };
          }
        }
        if (expectedFingerprint && entry.status === 'ready') {
          planStore.markActive(expectedFingerprint);
        }
        const dispatcher = deps.subAgent ?? {
          dispatch: async () => {
            throw new Error('本计划为本地 hardware_flash，不应调用 MCP dispatch');
          },
        };
        const workflow = await executeDomainWorkflow(entry.plan, dispatcher, {
          hardware: {
            devices: deps.deviceAuth ?? new DeviceAuthStore(),
            ...(deps.flashRunner ? { flashRunner: deps.flashRunner } : {}),
          },
        });
        const risk = entry.plan.nodes[0]?.risk;
        const action = entry.status === 'inventory_required'
          ? '只读盘点'
          : risk === 'write' ? 'KiCad 编辑'
            : risk === 'simulate' ? 'LTspice 仿真'
              : risk === 'flash' ? '烧录'
                : '构建';
        const fingerprint = fingerprintDomainWorkflowPlan(entry.plan);
        if (expectedFingerprint) {
          if (workflow.ok) planStore.markDone(expectedFingerprint);
          else planStore.markFailed(expectedFingerprint);
        }
        return {
          result: workflow.ok
            ? `${entry.message}\n${action}已完成。\n计划指纹：${shortPlanFingerprint(fingerprint)}`
            : `${entry.message}\n${action}未完成：${workflow.handoff.reason ?? '请交由用户审查。'}`,
          confidence: workflow.ok ? 0.8 : 0.3,
          followUpAction: entry.status === 'inventory_required'
            ? (formatPlatformChoices(entry.platformChoices)
              ?? '画像已更新；如需构建，请重新发起构建请求并完成批准。')
            : workflow.handoff.nextAction,
          artifacts: [{
            kind: 'mcp-domain-workflow',
            title: 'MCP 领域工作流',
            data: {
              entry,
              workflow,
              fingerprint,
              fingerprintShort: shortPlanFingerprint(fingerprint),
              evidenceChain: (workflow.evidence ?? []).map((item) => ({
                nodeId: item.nodeId,
                agentId: item.agentId,
                toolName: item.toolName,
                attempt: item.attempt,
                untrusted: true as const,
              })),
            },
          }],
        };
      }

      if (!deps.subAgent) {
        return {
          result: 'MCP 子 Agent 调度未装配，无法执行系统/工具类操作。',
          confidence: 0.2,
          followUpAction: '配置 configs/mcp-agents.json 启用真实 MCP server 后可用。',
          };
      }
      const match = input.query.match(TOOL_REF_RE);
      let toolRef = match?.[1];
      let args = parseArgs(match?.[2]);
      for (const [key, value] of DANGEROUS_ARGS) {
        if (args[key] === value) {
          return {
            result: `危险参数 ${key}=${value} 默认拒绝（§10 双闸），如需执行请人工审批。`,
            confidence: 0.3,
            followUpAction: '本工具默认只读，危险操作不自动执行。',
          };
        }
      }
      if (toolRef?.endsWith('.Process') && Object.keys(args).length === 0) {
        args = { mode: 'list', limit: 20 };
      }
      if (!toolRef) {
        const projectPath = input.query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.uvprojx)/i)?.[1];
        if (projectPath) {
          if (/(?:项目画像|工程画像|盘点|profile|工具链)/i.test(input.query)) {
            toolRef = 'keil.InspectProjectProfile';
          } else {
            toolRef = /(?:列出|查看|有哪些|解析).{0,8}(?:target|目标配置)|(?:target|目标配置).{0,8}(?:列出|查看|有哪些|解析)/i.test(input.query)
              ? 'keil.ListTargets'
              : 'keil.BuildProject';
          }
          args = { projectPath: projectPath.trim() };
        } else if (/keil|\.uvprojx/i.test(input.query)) {
          toolRef = 'keil.DiscoverProjects';
          args = { root: 'projects' };
        } else if (/vs\s*code|vscode/i.test(input.query)) {
          const root = input.query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\s]+)/i)?.[1] ?? 'projects';
          toolRef = /(?:盘点|检查|配置|task|诊断|画像)/i.test(input.query)
            ? 'vscode.InspectWorkspace'
            : 'vscode.DiscoverWorkspaces';
          args = { root };
        } else if (/stm32-gcc|arm-none-eabi|stm32.{0,12}cmake/i.test(input.query)) {
          const root = input.query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\s]+)/i)?.[1] ?? 'projects';
          toolRef = /(?:盘点|画像|配置|工具链)/i.test(input.query)
            ? 'stm32-gcc.InspectProjectProfile'
            : 'stm32-gcc.DiscoverProjects';
          args = { root };
        } else if (/kicad|\.kicad_(?:pro|sch)/i.test(input.query)) {
          const path = input.query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.kicad_(?:pro|sch))/i)?.[1];
          if (path) {
            // 编辑意图已由 isMcpDomainApprovalRequest 短路；此处仅只读/ERC
            toolRef = /(?:erc|电气规则|规则检查)/i.test(input.query) && /\.kicad_sch$/i.test(path.trim())
              ? 'kicad.RunErc'
              : 'kicad.InspectProject';
            args = toolRef === 'kicad.RunErc'
              ? { schematicPath: path.trim() }
              : { projectPath: path.trim() };
          } else {
            toolRef = 'kicad.DiscoverProjects';
            args = { root: 'projects' };
          }
        } else if (/ltspice|\.asc\b/i.test(input.query)) {
          // 仿真意图已由批准门短路；此处仅只读盘点
          const path = input.query.match(/((?:[A-Za-z]:\\|projects[\\/]|sandbox[\\/]|outputs[\\/])[^"“”\r\n]*?\.asc)/i)?.[1];
          toolRef = path ? 'ltspice.InspectSchematic' : 'ltspice.DiscoverSchematics';
          args = path ? { schematicPath: path.trim() } : { root: 'projects' };
        }
      }
      const options = toolRef
        ? {
            toolName: toolRef,
            args,
            ...(/^(?:keil|stm32-gcc)\.BuildProject$/.test(toolRef)
              ? { category: 'build' as const, opKind: 'compile' as const, retryCount: 0 }
              : /^(?:keil|stm32-gcc)\.(?:DiscoverProjects|InspectProjectProfile|ListTargets)$/.test(toolRef)
                ? { category: 'build' as const, deterministic: true }
                : toolRef.startsWith('vscode.')
                  ? { category: 'code' as const, deterministic: true }
                : toolRef === 'kicad.EditSchematic' || toolRef === 'kicad.EditPcb'
                  ? { category: 'eda' as const, opKind: 'filegen' as const, retryCount: 0 }
                : toolRef.startsWith('kicad.')
                  ? { category: 'eda' as const, deterministic: true, retryCount: 0 }
                : toolRef === 'ltspice.RunSimulation'
                  ? { category: 'simulation' as const, opKind: 'compile' as const, retryCount: 0 }
                : toolRef.startsWith('ltspice.')
                  ? { category: 'simulation' as const, deterministic: true }
                : {}),
          }
        : { category: 'system' as const, args };
      const result = await deps.subAgent.dispatch(input.query, options);
      const presentation = presentMcpOutput(result.output);
      const display = presentation.text;
      if (result.ok) {
        return {
          result: display || '子 Agent 执行完成，无文本输出。',
          confidence: 0.8,
          followUpAction: '输出来自 MCP 工具（untrusted 域，仅作展示/证据，未直接驱动后续动作）。',
          ...(presentation.artifacts.length ? { artifacts: presentation.artifacts } : {}),
        };
      }
      return {
        result: result.error ? `子 Agent 执行失败：${display || result.error}` : '子 Agent 当前不可用。',
        confidence: 0.3,
        followUpAction: '请确认对应软件已安装并配置 configs/mcp-agents.json。',
        ...(presentation.artifacts.length ? { artifacts: presentation.artifacts } : {}),
      };
    },
  };
}

function presentMcpOutput(output: string): { text: string; artifacts: SkillArtifact[] } {
  if (!output) return { text: '', artifacts: [] };
  try {
    const data = JSON.parse(output) as {
      projects?: string[];
      targets?: string[];
      count?: number;
      ok?: boolean;
      projectPath?: string;
      target?: string;
      warningCount?: number;
      errorCount?: number;
      diagnostics?: Array<{ severity?: string; file?: string; line?: number; sourcePath?: string; code?: string; message?: string }>;
      profile?: {
        projectId?: string;
        projectRoot?: string;
        platform?: string | null;
        chip?: string | null;
        targets?: string[];
        selectedTarget?: string | null;
      };
      profilePath?: string;
      workspaces?: string[];
      workspaceRoot?: string;
      tasks?: Array<{ label?: string; type?: string | null; group?: string | null; problemMatchers?: string[]; hasCommand?: boolean }>;
      cppConfigurations?: Array<{ name?: string; compilerPath?: string | null; compileCommands?: string | null }>;
      diagnosticMatchers?: string[];
      configurationDiagnostics?: Array<{ path?: string; message?: string }>;
      liveDiagnosticsAvailable?: boolean;
      platform?: string;
      projectRoot?: string;
      buildDir?: string;
      schematics?: string[];
      schematicPath?: string;
      schematicFiles?: string[];
      boardFiles?: string[];
      componentCount?: number;
      symbolKinds?: string[];
      simulationDirectives?: string[];
      includeDirectives?: string[];
      simulationExecuted?: boolean;
      outputFiles?: Array<{ path?: string; bytes?: number; sha256?: string }>;
      batchArgs?: string[];
      sourceUnchanged?: boolean;
      reportGenerated?: boolean;
      reportRetained?: boolean;
      violations?: unknown[];
      exclusionCount?: number;
      committedPaths?: string[];
      summary?: string;
      transactionId?: string;
    };
    if (Array.isArray(data.schematics)) {
      return {
        text: data.schematics.length > 0
          ? `找到 ${data.count ?? data.schematics.length} 个 LTspice 原理图：\n${data.schematics.join('\n')}`
          : '未找到 LTspice .asc 原理图。',
        artifacts: [],
      };
    }
    if (data.simulationExecuted === true && data.schematicPath) {
      const outputs = (data.outputFiles ?? [])
        .map((item) => `- ${item.path}（${item.bytes ?? 0} 字节）`)
        .join('\n');
      return {
        text: [
          `LTspice 批仿真${data.ok ? '完成' : '未成功'}：${data.schematicPath}`,
          `参数：${(data.batchArgs ?? []).join(' ')}`,
          outputs ? `产物：\n${outputs}` : '未检测到新的 raw/log/net 产物',
        ].join('\n'),
        artifacts: [{ kind: 'ltspice-simulation-result', title: 'LTspice 仿真结果', data }],
      };
    }
    if (data.schematicPath && data.simulationExecuted === false) {
      return {
        text: [
          `LTspice 原理图只读盘点：${data.schematicPath}`,
          `元件 ${data.componentCount ?? 0} 个；仿真指令 ${data.simulationDirectives?.length ?? 0} 条；模型引用 ${data.includeDirectives?.length ?? 0} 条`,
          '仿真执行：否',
        ].join('\n'),
        artifacts: [{ kind: 'ltspice-schematic-profile', title: 'LTspice 原理图画像', data }],
      };
    }
    if (Array.isArray(data.committedPaths) && typeof data.summary === 'string') {
      return {
        text: [
          `KiCad 编辑已提交：${data.summary}`,
          `事务：${data.transactionId ?? 'n/a'}`,
          `文件：${data.committedPaths.join('、')}`,
        ].join('\n'),
        artifacts: [{ kind: 'kicad-schematic-edit', title: 'KiCad 原理图编辑', data }],
      };
    }
    if (typeof data.sourceUnchanged === 'boolean' && Array.isArray(data.violations)) {
      return {
        text: [
          `KiCad ERC ${data.ok ? '通过' : '完成但存在问题或执行失败'}`,
          `违规 ${data.violations.length} 条；排除项 ${data.exclusionCount ?? 0} 条；源文件未改变：${data.sourceUnchanged ? '是' : '否'}；临时报告已清理：${data.reportRetained === false ? '是' : '否'}`,
        ].join('\n'),
        artifacts: [{ kind: 'kicad-erc-diagnostics', title: 'KiCad ERC 诊断', data }],
      };
    }
    if (data.projectPath && Array.isArray(data.schematicFiles) && Array.isArray(data.boardFiles)) {
      return {
        text: [
          `KiCad 工程只读盘点：${data.projectPath}`,
          `原理图 ${data.schematicFiles.length} 个；PCB ${data.boardFiles.length} 个`,
        ].join('\n'),
        artifacts: [{ kind: 'kicad-project-profile', title: 'KiCad 工程画像', data }],
      };
    }
    if (Array.isArray(data.workspaces)) {
      return {
        text: data.workspaces.length > 0
          ? `找到 ${data.count ?? data.workspaces.length} 个 VS Code 工作区：\n${data.workspaces.join('\n')}`
          : '未找到含 .vscode 或 .code-workspace 的工作区。',
        artifacts: [],
      };
    }
    if (data.workspaceRoot && Array.isArray(data.tasks)) {
      const diagnostics = data.configurationDiagnostics ?? [];
      return {
        text: [
          `VS Code 工作区只读盘点：${data.workspaceRoot}`,
          `任务 ${data.tasks.length} 个；C/C++ 配置 ${data.cppConfigurations?.length ?? 0} 个；problemMatcher ${data.diagnosticMatchers?.length ?? 0} 个`,
          diagnostics.length > 0 ? `配置诊断 ${diagnostics.length} 条` : '配置文件解析正常',
          '实时编辑器诊断：未接入',
        ].join('\n'),
        artifacts: [{
          kind: 'vscode-workspace-profile',
          title: 'VS Code 工作区画像',
          data,
        }],
      };
    }
    if (Array.isArray(data.projects)) {
      const product = data.platform === 'stm32-gcc-cmake' ? 'STM32-GCC' : data.platform === 'kicad' ? 'KiCad' : 'Keil';
      return {
        text: data.projects.length > 0
          ? `找到 ${data.count ?? data.projects.length} 个 ${product} 工程：\n${data.projects.join('\n')}`
          : `工作区 projects/ 内未找到 ${product} 工程。`,
        artifacts: [],
      };
    }
    if (data.profile?.projectId && data.profile.projectRoot) {
      const targets = data.profile.targets ?? [];
      const product = data.profile.platform === 'stm32-gcc-cmake' ? 'STM32-GCC' : 'Keil';
      return {
        text: [
          `${product} 项目画像已写入证据缓存：${data.profile.projectRoot}`,
          `平台：${data.profile.platform ?? '未确认'}；芯片：${data.profile.chip ?? '未确认'}`,
          `targets：${targets.length > 0 ? targets.join('、') : '未发现'}；选定 target：${data.profile.selectedTarget ?? '未选择'}`,
          ...(data.profilePath ? [`缓存：${data.profilePath}`] : []),
        ].join('\n'),
        artifacts: [{
          kind: data.profile.platform === 'stm32-gcc-cmake' ? 'stm32-gcc-project-profile' : 'keil-project-profile',
          title: `${product} 项目画像`,
          data: { profile: data.profile, ...(data.profilePath ? { profilePath: data.profilePath } : {}) },
        }],
      };
    }
    if (data.projectRoot && data.buildDir) {
      const diagnostics = (data.diagnostics ?? []).map((item) => `${item.severity ?? 'info'} ${item.sourcePath ?? item.file ?? ''}${item.line ? `:${item.line}` : ''} ${item.message ?? ''}`.trim());
      return {
        text: [`STM32-GCC 构建${data.ok ? '成功' : '失败'}：${data.projectRoot}`, `warning ${data.warningCount ?? 0}，error ${data.errorCount ?? 0}`, ...diagnostics].join('\n'),
        artifacts: [{ kind: 'stm32-gcc-diagnostics', title: 'STM32-GCC 构建诊断', data }],
      };
    }
    if (data.projectPath && Array.isArray(data.targets)) {
      return {
        text: data.targets.length > 0
          ? `Keil 工程 ${data.projectPath} 有 ${data.count ?? data.targets.length} 个 target：\n${data.targets.join('\n')}`
          : `Keil 工程 ${data.projectPath} 未声明 target。`,
        artifacts: [{
          kind: 'keil-targets',
          title: 'Keil target 清单',
          data: { projectPath: data.projectPath, targets: data.targets },
        }],
      };
    }
    if (data.projectPath) {
      const diagnostics = (data.diagnostics ?? []).map((item) => {
        const file = item.sourcePath ?? item.file;
        const location = file ? `${file}${item.line ? `:${item.line}` : ''}` : '';
        return `${item.severity ?? 'info'} ${location} ${item.code ?? ''} ${item.message ?? ''}`.trim();
      });
      return {
        text: [
          `Keil 编译${data.ok ? '成功' : '失败'}：${data.projectPath}`,
          `warning ${data.warningCount ?? 0}，error ${data.errorCount ?? 0}`,
          ...diagnostics,
        ].join('\n'),
        artifacts: [{
          kind: 'keil-diagnostics',
          title: 'Keil 编译诊断',
          data: {
            projectPath: data.projectPath,
            ...(data.target ? { target: data.target } : {}),
            ok: data.ok === true,
            warningCount: data.warningCount ?? 0,
            errorCount: data.errorCount ?? 0,
            diagnostics: data.diagnostics ?? [],
          },
        }],
      };
    }
  } catch {
    // 非 Keil JSON 输出按原文展示。
  }
  return { text: output, artifacts: [] };
}
