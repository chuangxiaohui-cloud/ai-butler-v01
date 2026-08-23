/**
 * v1.0 S3：预置子 Agent 注册表（§4.1.2 工程开发栏左侧角色面板）
 * 子 Agent 列表按类别标注（EDA/结构/编码/仿真）；默认占位（available=false），
 * 真实接入由配置/安装流程置 available 并提供 stdio 命令。
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
