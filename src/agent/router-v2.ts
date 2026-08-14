/**
 * 三层意图路由（Phase 1，TS 版）
 * Layer 1 特征 → Layer 2 规则匹配 → Layer 3 置信度门控 + 消歧。
 */

import {
  extractIntentFeatureRuleBased,
  type IntentFeature,
} from './intent-feature.js';
import { extractIntentFeature } from './extract.js';
import { ROUTING_TABLE, type RoutingRule } from './routing-table.js';
import type { PrimaryLens } from './types.js';
import type { LLMClient } from '../search/llm.js';
import type { AttachmentSignal } from './multimodal-preprocessor.js';
import { PARAMS } from '../config/params.js';
import { clarifyTemplateFor } from './clarify-templates.js';

const FEATURE_WEIGHTS: Record<keyof IntentFeature, number> = {
  actionType: PARAMS.actionTypeWeight,
  targetDomain: PARAMS.targetDomainWeight,
  scope: PARAMS.scopeWeight,
  requiresExternalSearch: 0,
  searchSourceHint: PARAMS.searchSourceHintWeight,
  hasImplicitContext: 0,
  urgency: PARAMS.urgencyWeight,
  rawEntities: 0,
  ambiguityFlags: PARAMS.ambiguityFlagsWeight,
  hasImage: PARAMS.hasImageWeight,
  hasDocument: PARAMS.hasDocumentWeight,
  attachmentTypes: 0,
  fastImageDescription: 0,
  timeExpression: 0,
  hasTimeExpression: 0,
};

export interface RouteCandidate {
  rank: number;
  primaryLens: PrimaryLens;
  intent: string;
  tags: string[];
  searchNeed: boolean;
  skill?: string;
  executor?: string;
  postProcess?: string;
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

const MULTIMODAL_GATE_KEYS: Array<keyof IntentFeature> = ['hasImage', 'hasDocument'];

function allMatch(feature: IntentFeature, rule: RoutingRule): boolean {
  for (const key of Object.keys(rule.match) as (keyof IntentFeature)[]) {
    if (!featureMatch(feature, rule.match, key)) return false;
  }
  return true;
}

function scoreRule(feature: IntentFeature, rule: RoutingRule): { base: number; confidence: number } {
  for (const key of MULTIMODAL_GATE_KEYS) {
    const want = rule.match[key];
    if (want !== undefined && feature[key] !== want) {
      return { base: 0, confidence: 0 };
    }
  }
  if (rule.strictMatch && !allMatch(feature, rule)) {
    return { base: 0, confidence: 0 };
  }
  if (rule.baseConfidence !== undefined) {
    const base = allMatch(feature, rule) ? rule.baseConfidence : 0;
    return {
      base,
      confidence: Math.max(0, Math.min(1, base + rule.confidenceBoost)),
    };
  }
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

export function routeFromFeatures(
  query: string,
  features: IntentFeature,
  extractionSource: 'rule' | 'llm' | 'fallback',
  contextHints: string[] = [],
): RouteResultV2 {
  const extractionDiscount = extractionSource === 'fallback' ? PARAMS.fallbackDiscount : 1;
  const candidates: RouteCandidate[] = [];
  const reasoning: string[] = [];

  for (const rule of ROUTING_TABLE) {
    const { base } = scoreRule(features, rule);
    if (base < PARAMS.routeBaseThreshold) continue;
    const adjusted = Math.max(0, Math.min(1, (base + rule.confidenceBoost) * extractionDiscount));
    candidates.push({
      rank: 0,
      primaryLens: rule.primaryLens,
      intent: rule.intent,
      tags: rule.tags,
      searchNeed: rule.searchNeed,
      skill: rule.skill,
      executor: rule.executor,
      postProcess: rule.postProcess,
      confidence: adjusted,
      matchedRule: rule.id,
      reasoning: `${rule.id}: ${JSON.stringify(rule.match)}`,
    });
    reasoning.push(`${rule.id}=${adjusted.toFixed(2)}`);
  }

  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const deduped: RouteCandidate[] = [];
  const seenRoutes = new Set<string>();
  for (const c of sorted) {
    const key = [
      c.primaryLens,
      c.intent,
      c.searchNeed,
      c.skill ?? '',
      c.executor ?? '',
      c.postProcess ?? '',
    ].join('|');
    if (seenRoutes.has(key)) continue;
    seenRoutes.add(key);
    deduped.push(c);
  }
  deduped.forEach((c, i) => {
    c.rank = i + 1;
  });
  const top = deduped[0];
  const second = deduped[1];
  const topConfidence = top?.confidence ?? 0;

  let decision: RouteDecision;
  const hasMissingReferent = features.ambiguityFlags.includes('missing_referent');
  if (top && topConfidence >= PARAMS.routeConfidenceHigh - 1e-9) {
    decision = { type: 'direct', selected: top };
  } else if (topConfidence < PARAMS.routeConfidenceLow - 1e-9 && !hasMissingReferent) {
    decision = {
      type: 'must_clarify',
      question: clarifyTemplateFor(top?.primaryLens, 'lowConfidence').question,
      candidates: deduped,
    };
  } else if (topConfidence < PARAMS.routeConfidenceLow - 1e-9 && hasMissingReferent && deduped.length > 0) {
    const tpl = clarifyTemplateFor(top.primaryLens, 'missingReferent');
    decision = {
      type: 'option_clarify',
      question: tpl.question,
      options: deduped.slice(0, PARAMS.routeMaxCandidates).map((c, i) => ({
        id: String.fromCharCode(65 + i),
        label:
          contextHints.length > 0
            ? `${tpl.optionPrefix}：${contextHints[Math.min(i, contextHints.length - 1)].slice(0, 30)}`
            : `${c.primaryLens} / ${c.intent}`,
        description: c.reasoning,
        candidate: c,
      })),
    };
  } else if (
    (second && topConfidence - second.confidence < PARAMS.routeCandidateGap - 1e-9) ||
    deduped.length > 1
  ) {
    const tpl = clarifyTemplateFor(top?.primaryLens, 'options');
    decision = {
      type: 'option_clarify',
      question: tpl.question,
      options: deduped.slice(0, PARAMS.routeMaxCandidates).map((c, i) => ({
        id: String.fromCharCode(65 + i),
        label: `${tpl.optionPrefix}：${c.primaryLens} / ${c.intent}`,
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
    candidates: deduped,
    decision,
    confidence: topConfidence,
    reasoning,
  };
}

export function routeV2(query: string): RouteResultV2 {
  return routeFromFeatures(query, extractIntentFeatureRuleBased(query), 'rule');
}

export async function routeV2WithLLM(
  query: string,
  llm?: LLMClient,
  contextHints: string[] = [],
  attachments: AttachmentSignal[] = [],
): Promise<RouteResultV2> {
  const extraction = await extractIntentFeature(query, llm, attachments);
  return routeFromFeatures(query, extraction.features, extraction.source, contextHints);
}
