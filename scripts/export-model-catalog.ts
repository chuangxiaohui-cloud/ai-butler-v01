#!/usr/bin/env node
/**
 * 导出 Provider Registry 模型目录给 UI（E105）
 * 从当前 .env 解析可用 provider，生成 ui/prototype/public/model-providers.json，
 * UI 模型切换器优先读取该文件，缺失时回落静态列表。
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { defaultRegistry, MODEL_ROLES, type ModelRole } from '../src/search/llm-registry.js';
import { PARAMS } from '../src/config/params.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'ui', 'prototype', 'public', 'model-providers.json');

const ROLE_NOTES: Record<ModelRole, string> = {
  light: '快速',
  medium: '均衡',
  heavy: '旗舰 · 推理',
  vision: '视觉',
};

function main(): void {
  const registry = defaultRegistry();
  const profiles = MODEL_ROLES.flatMap((role) => registry.listProfiles(role));
  const byId = new Map<string, { provider: string; models: Partial<Record<ModelRole, string>> }>();
  for (const profile of profiles) {
    const entry = byId.get(profile.id) ?? {
      provider: profile.label,
      models: {},
    };
    for (const role of MODEL_ROLES) {
      entry.models[role] = profile.models[role];
    }
    byId.set(profile.id, entry);
  }

  const models: Array<{ id: string; provider: string; label: string; note: string }> = [];
  for (const [id, entry] of byId) {
    for (const role of MODEL_ROLES) {
      const label = entry.models[role];
      if (!label) continue;
      models.push({
        id: `${id}:${role}`,
        provider: entry.provider,
        label,
        note: ROLE_NOTES[role],
      });
    }
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    defaultTier: PARAMS.modelRouterDefaultTier,
    tiers: [...MODEL_ROLES],
    models,
  };
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
  console.log(`模型目录已导出: ${dest} (${models.length} 项)`);
}

main();
