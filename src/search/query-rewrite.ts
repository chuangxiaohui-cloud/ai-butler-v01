/**
 * 查询改写（§6 搜索管道前置）
 * 口语 → 1-4 条检索子查询；LLM 优先，失败/无 LLM 时保留原 query。
 */

import type { ChatMessage, LLMClient } from './llm.js';
import type { IntentKey } from './stages/s2_classify.js';
import {
  DOMESTIC_DATASHEET_DOMAINS,
  extractPartNumber,
  officialSourceHintForQuery,
} from './authority.js';

export interface RewriteResult {
  queries: string[];
  source: 'llm' | 'rule';
  issues: string[];
}

const MODEL_CODE_RE = /[A-Z]{2,4}-[A-Z0-9]{2,4}/;
const PHONE_HINT_RE = /手机|机型|入网|型号/;
const NEWS_YEAR_RE = /20\d{2}/;
const SPORTS_NEWS_RE = /世界杯|足球|篮球|比赛|赛事|英超|西甲|欧冠|NBA|CBA|网球|F1|赛果|战报|比分|直播/;
const VERSION_QUERY_RE = /最新.*版本|版本.*最新|最新版本号|版本号|latest.*version|version.*latest/;
const VERSION_PROJECT_RE = /[A-Za-z][A-Za-z0-9_.-]+/;

export function ruleBasedRewrite(query: string, intent?: IntentKey): string[] {
  if (intent === 'news') {
    const year = NEWS_YEAR_RE.test(query) ? '' : `${new Date().getFullYear()} `;
    const base = `${year}${query}`.trim();
    const queries = [`${base} 最新`, query];
    if (SPORTS_NEWS_RE.test(query)) {
      if (/世界杯/.test(query)) {
        queries.unshift(
          `${year}世界杯 决赛 比分 冠军 最新`,
          `${year}世界杯 赛果 比分 冠军 最新`,
        );
      } else {
        queries.unshift(`${base} 决赛 比分 冠军 最新`, `${base} 赛果 比分 冠军 最新`);
      }
    }
    return uniqueQueries(queries);
  }
  const versionProject = query.match(VERSION_PROJECT_RE)?.[0];
  if (versionProject && VERSION_QUERY_RE.test(query)) {
    return uniqueQueries([
      `${versionProject} GitHub release latest version`,
      `${versionProject} npm latest version`,
      query,
    ]);
  }
  const model = query.match(MODEL_CODE_RE)?.[0];
  if (model && PHONE_HINT_RE.test(query)) {
    return uniqueQueries([
      `${model} 入网型号 对应手机型号`,
      `${model} 手机型号`,
      query,
    ]);
  }
  const part = extractPartNumber(query);
  const officialHint = officialSourceHintForQuery(query);
  if (part && officialHint) {
    const domesticQueries = DOMESTIC_DATASHEET_DOMAINS.map(
      (domain) => `${part} site:${domain} datasheet`,
    );
    return uniqueQueries([
      `${part} site:${officialHint.domain} datasheet`,
      `${part} ${officialHint.domain} 官方 数据手册`,
      ...domesticQueries,
      query,
    ]);
  }
  if (part) {
    return uniqueQueries([
      ...DOMESTIC_DATASHEET_DOMAINS.map((domain) => `${part} site:${domain} datasheet`),
      query,
    ]);
  }
  return [query];
}

function uniqueQueries(queries: string[]): string[] {
  return [...new Set(queries)];
}

export function buildRewriteMessages(query: string, intent: IntentKey): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是检索查询改写器。把口语问题改写成 1-4 条独立的搜索引擎子查询，只输出 JSON：{"queries": ["..."]}。不要解释。',
    },
    { role: 'user', content: `意图：${intent}\n问题：${query}` },
  ];
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

export async function rewriteQuery(
  query: string,
  intent: IntentKey,
  llm?: LLMClient,
): Promise<RewriteResult> {
  const ruleQueries = ruleBasedRewrite(query, intent);
  const needsRuleQueries = ruleQueries.length > 1;
  if (!llm) {
    return { queries: ruleQueries, source: 'rule', issues: [] };
  }
  try {
    const raw = await llm.complete(buildRewriteMessages(query, intent), {
      temperature: 0,
      maxTokens: 200,
      json: true,
    });
    const parsed = extractJsonObject(raw) as { queries?: unknown } | null;
    const queries = Array.isArray(parsed?.queries)
      ? parsed.queries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 4)
      : [];
    if (queries.length === 0) throw new Error('改写结果缺少 queries');
    return {
      queries: uniqueQueries(needsRuleQueries ? [...ruleQueries, ...queries] : queries),
      source: 'llm',
      issues: [],
    };
  } catch (err) {
    return {
      queries: uniqueQueries(ruleQueries),
      source: 'rule',
      issues: [err instanceof Error ? err.message : String(err)],
    };
  }
}
