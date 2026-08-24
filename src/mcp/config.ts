/**
 * E240（S3 真实接入）：子 Agent 配置装配。
 * 读取 configs/mcp-agents.json 声明真实 stdio MCP server（命令/白名单/映射），
 * 构造 StdioMcpClient 并返回可用子 Agent 列表与 clients 表；无配置文件时保持占位。
 * §10：allowedTools 缺省全拒，配置必须显式列出允许的真实工具。
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioMcpClient } from './client.js';
import { applyMcpAgentConfig } from './registry.js';
import type { McpClient, SubAgentMeta } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = join(root, 'configs', 'mcp-agents.json');

export interface McpAgentConfigEntry {
  id: string;
  command: string[];
  allowedTools: string[];
  toolMap?: Record<string, string>;
  defaultTool?: string;
  defaultArgs?: Record<string, unknown>;
  heartbeatMs?: number;
  startTimeoutMs?: number;
}

export interface McpAgentConfigFile {
  agents: McpAgentConfigEntry[];
}

export function loadMcpAgentConfig(path = CONFIG_PATH): McpAgentConfigEntry[] {
  if (!existsSync(path)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
  const agents = (raw as McpAgentConfigFile)?.agents;
  if (!Array.isArray(agents)) return [];
  return agents.filter(
    (a) =>
      a &&
      typeof a.id === 'string' &&
      Array.isArray(a.command) &&
      a.command.length > 0 &&
      Array.isArray(a.allowedTools),
  );
}

/** E240：按配置启用子 Agent，返回 { metas, clients }；未配置或命令缺失时为空表 */
export function createMcpAgents(entries = loadMcpAgentConfig()): {
  metas: SubAgentMeta[];
  clients: Map<string, McpClient>;
} {
  const metas: SubAgentMeta[] = [];
  const clients = new Map<string, McpClient>();
  for (const entry of entries) {
    const configured = applyMcpAgentConfig({
      id: entry.id,
      available: true,
      command: entry.command,
      allowedTools: entry.allowedTools,
      toolMap: entry.toolMap,
      defaultTool: entry.defaultTool,
      defaultArgs: entry.defaultArgs,
      heartbeatMs: entry.heartbeatMs,
      startTimeoutMs: entry.startTimeoutMs,
    });
    if (!configured || configured.command.length === 0) continue;
    metas.push(configured);
    clients.set(
      configured.id,
      new StdioMcpClient(configured.command, {
        heartbeatMs: entry.heartbeatMs,
        startTimeoutMs: entry.startTimeoutMs,
      }),
    );
  }
  return { metas, clients };
}

/** 关闭所有已启用子 Agent 的子进程（进程退出即销毁） */
export function closeMcpAgents(clients: Map<string, McpClient>): void {
  for (const client of clients.values()) client.close();
}