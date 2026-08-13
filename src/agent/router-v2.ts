/**
 * 三层意图路由（Phase 1，TS 版）
 * Layer 1 特征 → Layer 2 规则匹配 → Layer 3 置信度门控 + 消歧。
 */

import {
  extractIntentFeatureRuleBased,
  type IntentFeature,
} from './intent-feature.js';
import { ROUTING_TABLE, type RoutingRule } from './routing-table.js';
import type { PrimaryLens } from './types.js';

export const P80_ROUTE_CONFIDENCE_HIGH = 0.75; // [P-80]
export const P81_ROUTE_CONFIDENCE_LOW = 0.45; // [P-81]
export const P82_CANDIDATE_GAP = 0.15; // [P-82]
export const P83_ROUTE_LLM_TIMEOUT_MS = 1500; // [P-83]
export const P84_FALLBACK_DISCOUNT = 0.9; // [P-84]

const FEATURE_WEIGHTS: Record<keyof IntentFeature, number> = {
  actionType: 0.3,
  targetDomain: 0.25,
  scope: 0.15,
  requiresExternalSearch: 0,
  searchSourceHint: 0.15,
  hasImplicitContext: 0,
  urgency: 0.05,
  rawEntities: 0,
  ambiguityFlags: 0.1,
};

export interface RouteCandidate {
  rank: number;
  primaryLens: PrimaryLens;
  intent: string;
  tags: string[];
  searchNeed: boolean;
  skill?: string;
  executor?: string;
  confidence: number;
  matchedRule: string;
  reasoning: string;
}

export type RouteDecision =
  | { type: 'direct' | 'confirm'; selected: RouteCandidate }
  | {
      type: 'option_clarify';
      question: string;
      options: Array<{ id: string; label: string; description: string; candidate: RouteCandidate | null }>;
    }
  | { type: 'must_clarify'; question: string; candidates: RouteCandidate[] };

export interface RouteResultV2 {
  query: string;
  features: IntentFeature;
  extractionSource: 'rule' | 'llm' | 'fallback';
  candidates: RouteCandidate[];
  decision: RouteDecision;
  confidence: number;
  reasoning: string[];
}

function featureMatch(actual: IntentFeature, expected: Partial<IntentFeature>, key: keyof IntentFeature): boolean {
  const want = expected[key];
  if (want === undefined) return true;
  if (Array.isArray(want)) {
    const actualArr = actual[key] as unknown[];
    return want.some((w) => actualArr.includes(w));
  }
  return actual[key] === want;
}

function scoreRule(feature: IntentFeature, rule: RoutingRule): { base: number; confidence: number } {
  let weightSum = 0;
  let hitWeight = 0;
  for (const weight of Object.values(FEATURE_WEIGHTS)) weightSum += weight;
  for (const key of Object.keys(FEATURE_WEIGHTS) as (keyof IntentFeature)[]) {
    if (rule.match[key] === undefined) continue;
    const weight = FEATURE_WEIGHTS[key];
    if (featureMatch(feature, rule.match, key)) hitWeight += weight;
  }
  const base = weightSum > 0 ? hitWeight / weightSum : 0;
  return {
    base,
    confidence: Math.max(0, Math.min(1, base + rule.confidenceBoost)),
  };
}

export function routeV2(query: string): RouteResultV2 {
  const features = extractIntentFeatureRuleBased(query);
  const extractionSource = 'rule' as 'rule' | 'llm' | 'fallback';
  const extractionDiscount = extractionSource === 'fallback' ? P84_FALLBACK_DISCOUNT : 1;
  const candidates: RouteCandidate[] = [];
  const reasoning: string[] = [];

  for (const rule of ROUTING_TABLE) {
    const { base } = scoreRule(features, rule);
    if (base < 0.29) continue;
    const adjusted = Math.max(0, Math.min(1, (base + rule.confidenceBoost) * extractionDiscount));
    candidates.push({
      rank: 0,
      primaryLens: rule.primaryLens,
      intent: rule.intent,
      tags: rule.tags,
      searchNeed: rule.searchNeed,
      skill: rule.skill,
      executor: rule.executor,
      confidence: adjusted,
      matchedRule: rule.id,
      reasoning: `${rule.id}: ${JSON.stringify(rule.match)}`,
    });
    reasoning.push(`${rule.id}=${adjusted.toFixed(2)}`);
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  candidates.forEach((c, i) => {
    c.rank = i + 1;
  });
  const top = candidates[0];
  const second = candidates[1];
  const topConfidence = top?.confidence ?? 0;

  let decision: RouteDecision;
  const hasMissingReferent = features.ambiguityFlags.includes('missing_referent');
  if (top && topConfidence >= P80_ROUTE_CONFIDENCE_HIGH) {
    decision = { type: 'direct', selected: top };
  } else if (topConfidence < P81_ROUTE_CONFIDENCE_LOW && !hasMissingReferent) {
    decision = {
      type: 'must_clarify',
      question: '我没把握你要做什么，能说得更具体一点吗？',
      candidates,
    };
  } else if (topConfidence < P81_ROUTE_CONFIDENCE_LOW && hasMissingReferent && candidates.length > 0) {
    decision = {
      type: 'option_clarify',
      question: '你提到的对象有歧义，你想让我处理哪个方向？',
      options: candidates.slice(0, 3).map((c, i) => ({
        id: String.fromCharCode(65 + i),
        label: `${c.primaryLens} / ${c.intent}`,
        description: c.reasoning,
        candidate: c,
      })),
    };
  } else if (
    (second && topConfidence - second.confidence < P82_CANDIDATE_GAP) ||
    candidates.length > 1
  ) {
    decision = {
      type: 'option_clarify',
      question: '你想让我做哪个方向？',
      options: candidates.slice(0, 3).map((c, i) => ({
        id: String.fromCharCode(65 + i),
        label: `${c.primaryLens} / ${c.intent}`,
        description: c.reasoning,
        candidate: c,
      })),
    };
  } else if (top) {
    decision = { type: 'confirm', selected: top };
  } else {
    decision = {
      type: 'must_clarify',
      question: '我没识别出你的意图，能重新描述一下吗？',
      candidates: [],
    };
  }

  return {
    query,
    features,
    extractionSource,
    candidates,
    decision,
    confidence: topConfidence,
    reasoning,
  };
}
