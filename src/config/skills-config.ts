/**
 * Skill 启用/禁用持久化（E112）
 * UI“技能库”写 data/skills-config.json，pipeline 执行时跳过禁用技能。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export function skillsConfigPath(root = process.cwd()): string {
  return join(root, 'data', 'skills-config.json');
}

export function readDisabledSkills(file = skillsConfigPath()): Set<string> {
  if (!existsSync(file)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as { disabled?: unknown };
    if (!Array.isArray(raw.disabled)) return new Set();
    return new Set(raw.disabled.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

export function writeDisabledSkills(disabled: string[], file = skillsConfigPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ disabled }, null, 2)}\n`, 'utf-8');
}
