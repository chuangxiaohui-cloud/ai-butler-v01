/**
 * 查询改写（§6 搜索管道前置）
 * 口语 → 1-4 条检索子查询；LLM 优先，失败/无 LLM 时保留原 query。
 */

import type { ChatMessage, LLMClient } from './llm.js';
import type { IntentKey } from './stages/s2_classify.js';

export interface RewriteResult {
  queries: string[];
  source: 'llm' | 'rule';
  issues: string[];
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
  if (!llm) return { queries: [query], source: 'rule', issues: [] };
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
    return { queries, source: 'llm', issues: [] };
  } catch (err) {
    return {
      queries: [query],
      source: 'rule',
      issues: [err instanceof Error ? err.message : String(err)],
    };
  }
}
