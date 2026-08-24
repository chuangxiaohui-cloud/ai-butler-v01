/**
 * v1.0 S3：预置子 Agent 注册表（§4.1.2 工程开发栏左侧角色面板）
 * 子 Agent 列表按类别标注（EDA/结构/编码/仿真）；默认占位（available=false），
 * 真实接入由配置/安装流程置 available 并提供 stdio 命令（E240：configs/mcp-agents.json）。
 */

import type { SubAgentCategory, SubAgentMeta } from './types.js';

const SUB_AGENTS: SubAgentMeta[] = [
  {
    id: 'kicad',
    name: 'KiCad',
    category: 'eda',
    toolPrefix: 'kicad.',
    available: false,
    command: [],
  },
  {
    id: 'altium',
    name: 'Altium Designer',
    category: 'eda',
    toolPrefix: 'altium.',
    available: false,
    command: [],
  },
  {
    id: 'freecad',
    name: 'FreeCAD',
    category: 'structure',
    toolPrefix: 'freecad.',
    available: false,
    command: [],
  },
  {
    id: 'keil',
    name: 'Keil',
    category: 'build',
    toolPrefix: 'keil.',
    available: false,
    command: [],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'code',
    toolPrefix: 'cursor.',
    available: false,
    command: [],
  },
  {
    id: 'ltspice',
    name: 'LTspice',
    category: 'simulation',
    toolPrefix: 'ltspice.',
    available: false,
    command: [],
  },
  // E240（S3 真实接入）：windows-mcp 真实 stdio server 占位；命令与白名单由配置启用
  {
    id: 'windows',
    name: 'Windows 桌面控制',
    category: 'system',
    toolPrefix: 'windows.',
    available: false,
    command: [],
    defaultTool: 'windows.Process',
    // 只读默认：Process 工具必须显式 mode，自然语言「列出进程」用 list（§10）
    defaultArgs: { mode: 'list', limit: 20 },
  },
];

export function getSubAgents(): SubAgentMeta[] {
  return SUB_AGENTS.map((meta) => ({ ...meta, command: [...meta.command] }));
}

export function findSubAgent(id: string): SubAgentMeta | null {
  return SUB_AGENTS.find((meta) => meta.id === id) ?? null;
}

export function findAvailable(category: SubAgentCategory | undefined): SubAgentMeta[] {
  return SUB_AGENTS.filter(
    (meta) => meta.available && (category === undefined || meta.category === category),
  );
}

/** E240：按配置覆盖子 Agent 元数据（命令/白名单/映射），供 configs/mcp-agents.json 装配；
 *  name/category/toolPrefix 以注册表为准，配置只负责启用与安全白名单。 */
export function applyMcpAgentConfig(meta: Pick<SubAgentMeta, 'id' | 'command'> & Partial<SubAgentMeta>): SubAgentMeta | null {
  const base = findSubAgent(meta.id);
  if (!base) return null;
  return {
    ...base,
    available: meta.available ?? true,
    command: [...meta.command],
    toolMap: meta.toolMap ? { ...meta.toolMap } : base.toolMap,
    allowedTools: meta.allowedTools ? [...meta.allowedTools] : base.allowedTools,
    defaultTool: meta.defaultTool ?? base.defaultTool,
    defaultArgs: meta.defaultArgs ?? base.defaultArgs,
    heartbeatMs: meta.heartbeatMs ?? base.heartbeatMs,
    startTimeoutMs: meta.startTimeoutMs ?? base.startTimeoutMs,
  };
}