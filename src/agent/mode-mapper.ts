/**
 * 五主镜片 → UI 三模式映射（E109，UI 重构需求 §3.3）
 * owner/project_manager/architect/product_manager → 工程开发；
 * secretary 按意图拆生活助手 / 知识咨询。
 */

import type { PrimaryLens } from './types.js';

export type UiMode = 'engineering' | 'knowledge' | 'life';

export interface UiModeResult {
  mode: UiMode;
  submode?: 'product_planning' | 'review_critique';
}

const LIFE_INTENTS = new Set([
  'create_calendar',
  'local_query',
  'send_message',
  'emergency',
  'property_emergency',
]);

export function mapRouteToUiMode(primaryLens: PrimaryLens, intent: string): UiModeResult {
  switch (primaryLens) {
    case 'architect':
      return { mode: 'engineering' };
    case 'product_manager':
      return { mode: 'engineering', submode: 'product_planning' };
    case 'project_manager':
      return { mode: 'engineering', submode: 'review_critique' };
    case 'owner':
      return { mode: 'engineering', submode: 'review_critique' };
    case 'secretary':
      return LIFE_INTENTS.has(intent)
        ? { mode: 'life' }
        : { mode: 'knowledge' };
  }
}
