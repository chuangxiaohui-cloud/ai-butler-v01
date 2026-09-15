import { createHash } from 'node:crypto';

import { validateMcpCall } from './safety.js';
import { resolveRealToolName, type McpClient, type SubAgentMeta } from './types.js';

export interface McpHealthResult {
  ok: boolean;
  agentId: string;
  initializePassed: boolean;
  toolCount: number;
  toolNames: string[];
  verification: 'read_only_call' | 'connectivity_only' | 'failed';
  listElapsedMs: number;
  callElapsedMs?: number;
  checkedTool?: string;
  outputSha256?: string;
  outputBytes?: number;
  untrusted?: true;
  error?: string;
}

/**
 * 对单个已配置 MCP Agent 执行可重复健康检查：握手与 tools/list 必做；
 * 仅当注册表声明了默认工具和默认参数时，再执行该白名单内默认调用。
 */
export async function checkMcpAgentHealth(
  meta: SubAgentMeta,
  client: McpClient,
): Promise<McpHealthResult> {
  const listStarted = Date.now();
  try {
    const tools = await client.listTools();
    const toolNames = tools.map((tool) => tool.name);
    const listElapsedMs = Date.now() - listStarted;
    if (!meta.defaultTool || !meta.defaultArgs) {
      return {
        ok: true,
        agentId: meta.id,
        initializePassed: true,
        toolCount: tools.length,
        toolNames,
        verification: 'connectivity_only',
        listElapsedMs,
      };
    }

    const validation = validateMcpCall(meta, meta.defaultTool, meta.defaultArgs);
    const realTool = resolveRealToolName(meta, meta.defaultTool);
    if (!validation.ok || !realTool) {
      return {
        ok: false,
        agentId: meta.id,
        initializePassed: true,
        toolCount: tools.length,
        toolNames,
        verification: 'failed',
        listElapsedMs,
        error: validation.reason ?? `默认工具 ${meta.defaultTool} 未通过白名单校验`,
      };
    }
    if (!tools.some((tool) => tool.name === realTool)) {
      return {
        ok: false,
        agentId: meta.id,
        initializePassed: true,
        toolCount: tools.length,
        toolNames,
        verification: 'failed',
        listElapsedMs,
        checkedTool: realTool,
        error: `server 未声明默认工具 ${realTool}`,
      };
    }

    const callStarted = Date.now();
    const call = await client.callTool(realTool, meta.defaultArgs, meta.heartbeatMs);
    const callElapsedMs = Date.now() - callStarted;
    return {
      ok: call.ok,
      agentId: meta.id,
      initializePassed: true,
      toolCount: tools.length,
      toolNames,
      verification: call.ok ? 'read_only_call' : 'failed',
      listElapsedMs,
      callElapsedMs,
      checkedTool: realTool,
      ...(call.ok ? {
        outputSha256: createHash('sha256').update(call.output, 'utf8').digest('hex'),
        outputBytes: Buffer.byteLength(call.output, 'utf8'),
        untrusted: true as const,
      } : {}),
      error: call.error,
    };
  } catch (err) {
    return {
      ok: false,
      agentId: meta.id,
      initializePassed: false,
      toolCount: 0,
      toolNames: [],
      verification: 'failed',
      listElapsedMs: Date.now() - listStarted,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
