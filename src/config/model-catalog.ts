/**
 * Provider Registry 模型目录（供 UI 与 gateway 共用）
 * 只导出聊天档 light/medium/heavy；视觉档由 VLM Skill 按需解析。
 */

import { defaultRegistry, MODEL_ROLES, type ModelRole } from '../search/llm-registry.js';
import { PARAMS } from './params.js';

export interface ModelCatalogEntry {
  id: string;
  provider: string;
  label: string;
  note: string;
}

export interface ModelCatalog {
  generatedAt: string;
  defaultTier: string;
  tiers: ModelRole[];
  models: ModelCatalogEntry[];
}

const ROLE_NOTES: Record<ModelRole, string> = {
  light: '快速',
  medium: '均衡',
  heavy: '旗舰 · 推理',
  vision: '视觉',
};

export function buildModelCatalog(): ModelCatalog {
  const registry = defaultRegistry();
  const profiles = MODEL_ROLES.flatMap((role) => registry.listProfiles(role));
  const byId = new Map<string, { provider: string; models: Partial<Record<ModelRole, string>> }>();
  for (const profile of profiles) {
    const entry = byId.get(profile.id) ?? { provider: profile.label, models: {} };
    for (const role of MODEL_ROLES) {
      entry.models[role] = profile.models[role];
    }
    byId.set(profile.id, entry);
  }

  const models: ModelCatalogEntry[] = [];
  for (const [id, entry] of byId) {
    for (const role of ['light', 'medium', 'heavy'] as const) {
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

  return {
    generatedAt: new Date().toISOString(),
    defaultTier: PARAMS.modelRouterDefaultTier,
    tiers: ['light', 'medium', 'heavy'],
    models,
  };
}
