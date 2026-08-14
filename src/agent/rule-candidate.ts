/**
 * 路由规则候选生成（Phase 3）
 * 从 reject/correct 反馈 case 中提取特征，生成待人工审核的新规则。
 */

import type { IntentFeature } from './intent-feature.js';
import type { RoutingRule } from './routing-table.js';
import { ROUTING_TABLE } from './routing-table.js';
import type { RouteCaseRecord } from './route-case-store.js';

export interface RuleCandidate {
  id: string;
  sourceCaseId: string;
  query: string;
  match: Partial<IntentFeature>;
  primaryLens: string;
  intent: string;
  searchNeed: boolean;
  confidenceBoost: number;
  reason: string;
  status: 'proposed';
  createdAt: number;
}

function buildMatch(features: IntentFeature): Partial<IntentFeature> {
  const match: Partial<IntentFeature> = {};
  if (features.actionType && features.actionType !== 'unknown') {
    match.actionType = features.actionType;
  }
  if (features.targetDomain && features.targetDomain !== 'unknown') {
    match.targetDomain = features.targetDomain;
  }
  if (features.scope && features.scope !== 'unknown') {
    match.scope = features.scope;
  }
  if (features.searchSourceHint && features.searchSourceHint !== 'none') {
    match.searchSourceHint = features.searchSourceHint;
  }
  if (features.hasImage) match.hasImage = true;
  if (features.hasDocument) match.hasDocument = true;
  if (features.hasTimeExpression) match.hasTimeExpression = true;
  return match;
}

function matchCoveredBy(subset: Partial<IntentFeature>, superset: Partial<IntentFeature>): boolean {
  for (const key of Object.keys(subset)) {
    const sv = subset[key as keyof IntentFeature];
    const bv = superset[key as keyof IntentFeature];
    if (Array.isArray(sv) || Array.isArray(bv)) {
      const ss = Array.isArray(sv) ? sv : [sv];
      const bb = Array.isArray(bv) ? bv : [bv];
      if (ss.some((v) => !bb.includes(v))) return false;
    } else if (sv !== bv) {
      return false;
    }
  }
  return true;
}

export function generateRuleCandidates(
  records: RouteCaseRecord[],
  existing: RoutingRule[] = ROUTING_TABLE,
  now = Date.now(),
): RuleCandidate[] {
  const candidates: RuleCandidate[] = [];
  const seenKeys = new Set<string>();
  let index = 0;

  for (const record of records) {
    if (record.feedback !== 'reject' && record.feedback !== 'correct') continue;
    // 特征几乎为空时不可靠，不进入规则候选（新意图 can 以 must_clarify + 0 置信出现）
    const f = record.result.features;
    if (
      f.actionType === 'unknown' &&
      f.targetDomain === 'unknown' &&
      !f.hasTimeExpression &&
      !f.hasImage &&
      !f.hasDocument
    ) {
      continue;
    }
    const corrected = record.correctedRoute;
    if (!corrected?.primaryLens || !corrected.intent) continue;

    const match = buildMatch(record.result.features);
    if (Object.keys(match).length === 0) continue;

    const alreadyExists = existing.some(
      (rule) =>
        rule.primaryLens === corrected.primaryLens &&
        rule.intent === corrected.intent &&
        matchCoveredBy(rule.match, match),
    );
    if (alreadyExists) continue;

    const key = `${corrected.primaryLens}|${corrected.intent}|${JSON.stringify(match)}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    index += 1;

    candidates.push({
      id: `RC-${index}`,
      sourceCaseId: record.id,
      query: record.query,
      match,
      primaryLens: corrected.primaryLens,
      intent: corrected.intent,
      searchNeed: match.searchSourceHint === 'web_search',
      confidenceBoost: 0.15,
      reason: `来自 case ${record.id}（${record.query}）：feedback=${record.feedback}，修正目标=${corrected.primaryLens}/${corrected.intent}`,
      status: 'proposed',
      createdAt: now,
    });
  }

  return candidates;
}
