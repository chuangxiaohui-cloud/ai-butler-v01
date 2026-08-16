/**
 * UI 模型切换器 id → 后端模型选择（E106）
 * id 格式：`<provider>:<role>`，如 `deepseek:heavy` / `zhipu:medium`。
 */

import type { ModelTier } from './model-router.js';

export interface ModelSelection {
  provider: string;
  role: ModelTier;
}

export function parseModelId(modelId: string | undefined | null): ModelSelection | null {
  if (!modelId) return null;
  const index = modelId.indexOf(':');
  if (index <= 0) return null;
  const provider = modelId.slice(0, index).trim();
  const role = modelId.slice(index + 1).trim();
  if (!provider || (role !== 'light' && role !== 'medium' && role !== 'heavy')) {
    return null;
  }
  return { provider, role };
}
