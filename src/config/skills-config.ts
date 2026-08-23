/**
 * Skill 启用/禁用持久化（E112）
 * UI“技能库”写 data/skills-config.json，pipeline 执行时跳过禁用技能。
 *
 * H8（架构审计 2026-08-23）：readDisabledSkills 按文件 mtime 缓存结果——
 * 每次问答 ~24 次 readFileSync+JSON.parse 降为 statSync；writeDisabledSkills 显式失效，
 * 外部改动由 mtime 变化覆盖。
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

interface SkillsConfigCacheEntry {
  /** 读取时的文件 mtime；null = 文件不存在 */
  mtimeMs: number | null;
  disabled: Set<string>;
}

const cache = new Map<string, SkillsConfigCacheEntry>();

export function skillsConfigPath(root = process.cwd()): string {
  return join(root, 'data', 'skills-config.json');
}

export function readDisabledSkills(file = skillsConfigPath()): Set<string> {
  let mtimeMs: number | null = null;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    mtimeMs = null; // 文件不存在
  }
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.disabled;
  let disabled = new Set<string>();
  if (mtimeMs !== null) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as { disabled?: unknown };
      if (Array.isArray(raw.disabled)) {
        disabled = new Set(raw.disabled.filter((item): item is string => typeof item === 'string'));
      }
    } catch {
      disabled = new Set();
    }
  }
  cache.set(file, { mtimeMs, disabled });
  return disabled;
}

export function writeDisabledSkills(disabled: string[], file = skillsConfigPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ disabled }, null, 2)}\n`, 'utf-8');
  // H8：写后显式失效，下次读取重读文件（mtime 变化同样覆盖外部写入）
  cache.delete(file);
}
