/**
 * LLM 规则提案器（Phase 3）
 * 给定人工修正后的 case，让 LLM 生成规则候选；LLM 不可用/非法时回退到确定性生成。
 */

import type { LLMClient } from '../search/llm.js';
import {
  ACTION_TYPES,
  TARGET_DOMAINS,
  type ActionType,
  type Scope,
  type SearchSourceHint,
  type TargetDomain,
} from './intent-feature.js';
import { PRIMARY_LENSES, type PrimaryLens } from './types.js';
import { ROUTING_TABLE, type RoutingRule } from './routing-table.js';
import type { RouteCaseRecord } from './route-case-store.js';
import { generateRuleCandidates, type RuleCandidate } from './rule-candidate.js';

export interface LlmProposedRule {
  match: Partial<{
    actionType: ActionType;
    targetDomain: TargetDomain;
    scope: Scope;
    searchSourceHint: SearchSourceHint;
    hasImage: boolean;
    hasDocument: boolean;
  }>;
  route: { primaryLens: PrimaryLens; intent: string };
  confidenceBoost: number;
}

const SCOPES = ['atomic', 'multi_step', 'project_level'] as const;
const SOURCES = ['local_skill', 'web_search', 'internal_db', 'none'] as const;

function buildPrompt(record: RouteCaseRecord): string {
  return `你是路由规则提案器。给定一条被人工修正的路由 case，请提出一条可入库的新规则。

用户 query：${record.query}
当前特征：${JSON.stringify(record.result.features)}
当前决策：${record.result.decision.type}（confidence ${record.result.confidence.toFixed(2)}）
人工修正目标：${record.correctedRoute?.primaryLens}/${record.correctedRoute?.intent}

只输出 JSON，不要解释：
{
  "match": { "actionType": "analyze", "targetDomain": "security", "scope": "atomic", "searchSourceHint": "none" },
  "route": { "primaryLens": "owner", "intent": "risk_review" },
  "confidenceBoost": 0.15
}

规则：match 只放能稳定区分该意图的字段；不要放 ambiguityFlags；不要引入搜索。`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function validate(raw: unknown): LlmProposedRule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const match = o.match as Record<string, unknown> | undefined;
  const route = o.route as Record<string, unknown> | undefined;
  if (!match || typeof match !== 'object' || !route || typeof route !== 'object') return null;

  const out: LlmProposedRule = {
    match: {},
    route: { primaryLens: 'secretary', intent: '' },
    confidenceBoost: 0.15,
  };
  if (
    typeof match.actionType === 'string' &&
    (ACTION_TYPES as readonly string[]).includes(match.actionType)
  ) {
    out.match.actionType = match.actionType as ActionType;
  }
  if (
    typeof match.targetDomain === 'string' &&
    (TARGET_DOMAINS as readonly string[]).includes(match.targetDomain)
  ) {
    out.match.targetDomain = match.targetDomain as TargetDomain;
  }
  if (
    typeof match.scope === 'string' &&
    (SCOPES as readonly string[]).includes(match.scope)
  ) {
    out.match.scope = match.scope as Scope;
  }
  if (
    typeof match.searchSourceHint === 'string' &&
    (SOURCES as readonly string[]).includes(match.searchSourceHint)
  ) {
    out.match.searchSourceHint = match.searchSourceHint as SearchSourceHint;
  }
  if (match.hasImage === true) out.match.hasImage = true;
  if (match.hasDocument === true) out.match.hasDocument = true;

  if (
    typeof route.primaryLens !== 'string' ||
    !(PRIMARY_LENSES as readonly string[]).includes(route.primaryLens) ||
    typeof route.intent !== 'string' ||
    !route.intent.trim()
  ) {
    return null;
  }
  out.route.primaryLens = route.primaryLens as PrimaryLens;
  out.route.intent = route.intent.trim();
  if (typeof o.confidenceBoost === 'number' && Number.isFinite(o.confidenceBoost)) {
    out.confidenceBoost = o.confidenceBoost;
  }
  return out;
}

function coveredByExisting(match: LlmProposedRule['match'], existing: RoutingRule[]): boolean {
  return existing.some((rule) => {
    for (const key of Object.keys(rule.match)) {
      const want = rule.match[key as keyof typeof rule.match];
      const have = match[key as keyof typeof match];
      if (want !== have) return false;
    }
    return true;
  });
}

function fallback(record: RouteCaseRecord, existing: RoutingRule[]): RuleCandidate | null {
  return generateRuleCandidates([record], existing)[0] ?? null;
}

export async function proposeRuleWithLLM(
  record: RouteCaseRecord,
  llm: LLMClient,
  existing: RoutingRule[] = ROUTING_TABLE,
  now = Date.now(),
): Promise<RuleCandidate | null> {
  try {
    const raw = await llm.complete(
      [{ role: 'user', content: buildPrompt(record) }],
      { temperature: 0, maxTokens: 250, json: true },
    );
    const proposed = validate(extractJson(raw));
    if (!proposed) return fallback(record, existing);
    if (coveredByExisting(proposed.match, existing)) return null;
    return {
      id: `LLM-${record.id}`,
      sourceCaseId: record.id,
      query: record.query,
      match: proposed.match,
      primaryLens: proposed.route.primaryLens,
      intent: proposed.route.intent,
      searchNeed: proposed.match.searchSourceHint === 'web_search',
      confidenceBoost: proposed.confidenceBoost,
      reason: `LLM 提案（${record.id}：${record.query}）`,
      status: 'proposed',
      createdAt: now,
    };
  } catch {
    return fallback(record, existing);
  }
}
