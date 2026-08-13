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
import { PARAMS } from '../config/params.js';
import type { AttachmentSignal } from '../agent/multimodal-preprocessor.js';
import type { RawFileLike, SkillDeps } from './deps.js';
import type { UserContext } from '../memory/user-context.js';

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

// ── Week 1 增量（C1）：新接口先行，旧 Skill/handler 保持原样 ──

export interface SkillInput {
  query: string;
  attachmentSignals: AttachmentSignal[];
  rawFiles: RawFileLike[];
  memory: UserContext | null; // Week 1 恒传 null，Week 4 接入
  params?: Record<string, unknown>;
}

export interface SkillOutput {
  result: unknown; // 不假设字符串；字符串化只在显示边界
  followUpAction?: string;
  confidence: number;
}

/** 新体系接口；C3 迁移完成后改名 Skill 并退役旧接口 */
export interface ExecutableSkill {
  name: string;
  version: string;
  triggers: string[];
  execute: (input: SkillInput, deps: SkillDeps) => Promise<SkillOutput>;
}

export interface LegacySkillDef {
  name: string;
  version: string;
  triggers: string[];
  handler: (query: string) => Promise<unknown>; // 对象/null 均合法
}

export function wrapLegacySkill(legacy: LegacySkillDef): ExecutableSkill {
  return {
    name: legacy.name,
    version: legacy.version,
    triggers: legacy.triggers,
    execute: async (input, _deps) => ({
      result: await legacy.handler(input.query), // 原样透传，不转串
      confidence: PARAMS.legacySkillConfidence,
    }),
  };
}

/** 显示边界统一字符串化；postprocess/pipeline 出口调用，Skill 内部不调 */
export function toDisplayText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result == null) return '';
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.text === 'string') return r.text;
    if (typeof r.answer === 'string') return r.answer;
    return JSON.stringify(result);
  }
  return String(result);
}
