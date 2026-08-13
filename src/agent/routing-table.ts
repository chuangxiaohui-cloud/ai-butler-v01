/**
 * Layer 2: 路由规则表（§5 PARAM 联动）
 * 确定性映射：特征 → 主镜片 + 意图 + 标签 + 搜索开关。
 */

import type { PrimaryLens } from './types.js';
import type { IntentFeature } from './intent-feature.js';

export interface RoutingRule {
  id: string;
  match: Partial<IntentFeature>;
  primaryLens: PrimaryLens;
  intent: string;
  tags: string[];
  searchNeed: boolean;
  skill?: string;
  executor?: string;
  confidenceBoost: number;
}

export const ROUTING_TABLE: RoutingRule[] = [
  {
    id: 'R001',
    match: { actionType: 'create', targetDomain: 'code', scope: 'project_level' },
    primaryLens: 'project_manager',
    intent: 'plan',
    tags: ['plan', 'craft', 'must'],
    searchNeed: false,
    executor: 'engineer',
    confidenceBoost: 0.15,
  },
  {
    id: 'R002',
    match: { actionType: 'create', targetDomain: 'document' },
    primaryLens: 'product_manager',
    intent: 'write_doc',
    tags: [],
    searchNeed: false,
    executor: 'content_writer',
    confidenceBoost: 0.2,
  },
  {
    id: 'R003',
    match: { actionType: 'create', targetDomain: 'code', scope: 'atomic' },
    primaryLens: 'architect',
    intent: 'execute',
    tags: ['craft'],
    searchNeed: false,
    executor: 'engineer',
    confidenceBoost: 0.1,
  },
  {
    id: 'R004',
    match: { actionType: 'query', targetDomain: 'schedule', searchSourceHint: 'local_skill' },
    primaryLens: 'secretary',
    intent: 'local_query',
    tags: [],
    searchNeed: false,
    skill: 'calendar_skill',
    confidenceBoost: 0.2,
  },
  {
    id: 'R005',
    match: { actionType: 'send', targetDomain: 'message' },
    primaryLens: 'secretary',
    intent: 'send_message',
    tags: [],
    searchNeed: false,
    skill: 'im_dispatch',
    confidenceBoost: 0.25,
  },
  {
    id: 'R006',
    match: { actionType: 'analyze', ambiguityFlags: ['missing_referent'] },
    primaryLens: 'owner',
    intent: 'clarify',
    tags: [],
    searchNeed: false,
    confidenceBoost: 0,
  },
  {
    id: 'R007',
    match: { actionType: 'emergency' },
    primaryLens: 'secretary',
    intent: 'emergency',
    tags: [],
    searchNeed: false,
    confidenceBoost: 0.5,
  },
  {
    id: 'R008',
    match: { actionType: 'query', targetDomain: 'search', searchSourceHint: 'web_search' },
    primaryLens: 'secretary',
    intent: 'web_search',
    tags: ['search'],
    searchNeed: true,
    confidenceBoost: 0.3,
  },
  {
    id: 'R009',
    match: { actionType: 'create', targetDomain: 'document', scope: 'atomic' },
    primaryLens: 'product_manager',
    intent: 'write_doc',
    tags: ['craft'],
    searchNeed: false,
    executor: 'content_writer',
    confidenceBoost: 0.2,
  },
  {
    id: 'R010',
    match: { actionType: 'analyze', targetDomain: 'finance' },
    primaryLens: 'owner',
    intent: 'cost_analysis',
    tags: [],
    searchNeed: false,
    confidenceBoost: -0.15,
  },
  {
    id: 'R012',
    match: { actionType: 'unknown' },
    primaryLens: 'secretary',
    intent: 'web_search',
    tags: ['search'],
    searchNeed: true,
    confidenceBoost: 0.3,
  },
];
