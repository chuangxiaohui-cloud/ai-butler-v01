/**
 * 预置 Skill 注册表（§12.2，WP9）
 * 核心 2 项（chip-analysis / jargon-map）可装备，其余 4 项占位。
 */

import { skill as chipAnalysis } from './chip-analysis/index.js';
import { skill as circuitTopology } from './circuit-topology/index.js';
import { skill as datasheetSpeed } from './datasheet-speed/index.js';
import { skill as githubReader } from './github-reader/index.js';
import { skill as industryKits } from './industry-kits/index.js';
import { skill as jargonMap } from './jargon-map/index.js';

export interface Skill {
  name: string;
  version: string;
  triggers: string[];
  handler: (query: string) => Promise<unknown> | unknown;
}

const SKILLS: Skill[] = [
  chipAnalysis,
  githubReader,
  jargonMap,
  datasheetSpeed,
  circuitTopology,
  industryKits,
];

export function getSkills(): Skill[] {
  return [...SKILLS];
}

export function findSkill(query: string): Skill[] {
  const normalized = query.toLowerCase();
  return SKILLS.filter((skill) =>
    skill.triggers.some((trigger) => normalized.includes(trigger.toLowerCase())),
  );
}
