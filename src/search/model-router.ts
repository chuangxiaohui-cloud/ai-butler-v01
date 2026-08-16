/**
 * 模型分档路由（OpenSquilla 借鉴，E104）
 * 按任务难度选档：重档走最强模型，其余走中/轻档；便宜优先，配置缺失时回落。
 */

import { PARAMS } from '../config/params.js';

export type ModelTier = 'light' | 'medium' | 'heavy';

export interface ModelTierSignals {
  intent?: string;
  actionType?: string;
  searchNeed?: boolean;
  confidence?: number;
  hasImage?: boolean;
  hasDocument?: boolean;
  hasGithubLink?: boolean;
}

const HEAVY_INTENTS = new Set([
  'execute',
  'write_doc',
  'github_analysis',
  'rewrite',
  'pack_project',
  'plan',
  'document_summary',
  'document_structure',
]);

const HEAVY_ACTION_TYPES = new Set(['create', 'modify', 'rewrite', 'pack']);

export function resolveModelTier(signals: ModelTierSignals): ModelTier {
  if (signals.hasImage || signals.hasDocument) return 'medium';
  if (signals.intent && HEAVY_INTENTS.has(signals.intent)) return 'heavy';
  if (signals.actionType && HEAVY_ACTION_TYPES.has(signals.actionType)) return 'heavy';
  if (
    signals.confidence !== undefined &&
    signals.confidence >= PARAMS.modelRouterLightConfidence &&
    signals.searchNeed === false
  ) {
    return 'light';
  }
  return PARAMS.modelRouterDefaultTier;
}
