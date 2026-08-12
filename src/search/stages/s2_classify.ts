/**
 * Stage 2 意图分类 + Query 构造（§6.1.2）
 * 8 意图枚举；轻模型输出 JSON；失败/超时降级为 factual。
 */

import type { ChatMessage, LLMClient } from '../llm.js';
import { createLightClient } from '../llm.js';

export type IntentKey =
  | 'factual'
  | 'experience'
  | 'comparison'
  | 'how_to'
  | 'troubleshooting'
  | 'news'
  | 'github_analysis'
  | 'emergency';

export interface ClassifiedQuery {
  intent: IntentKey;
  searchQuery: string;
  timeWindow: string;
  domain: string;
  source: 'llm' | 'fallback';
  timedOut?: boolean;
}

const INTENTS: readonly IntentKey[] = [
  'factual',
  'experience',
  'comparison',
  'how_to',
  'troubleshooting',
  'news',
  'github_analysis',
  'emergency',
];

const CLASSIFY_SYSTEM_PROMPT = `你是搜索意图分类器。给定用户问题，只输出一个 JSON 对象，不要解释。
JSON 字段：
{
  "intent": "factual|experience|comparison|how_to|troubleshooting|news|github_analysis|emergency",
  "search_query": "用于搜索引擎的中文查询词",
  "time_window": "不限|≤2年|≤1年|≤24h|≤6月",
  "domain": "不限|官方优先|新闻源|github.com|csdn/bilibili/zhihu/公众号"
}
构造规则：
- factual：实体 + 属性，极简，官方优先
- experience：实体 + "踩坑/经验/注意事项" + 具体方面，≤2年
- comparison：A vs B + 对比维度，≤1年
- how_to：工具 + 操作 + 版本，≤1年，官方文档优先
- troubleshooting：错误信息 + 实体 + 环境，≤2年
- news：事件 + 时间限定，≤24h，新闻源
- github_analysis：项目名/URL + "架构/技术栈/用途"，≤6月，github.com
- emergency：伤病急救/灾害逃生/人身危险`;

export function buildClassifyMessages(query: string): ChatMessage[] {
  return [
    { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
    { role: 'user', content: query },
  ];
}

function isIntent(value: unknown): value is IntentKey {
  return typeof value === 'string' && (INTENTS as readonly string[]).includes(value);
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      err.cause instanceof Error &&
        err.cause.name === 'AbortError')
  );
}

export async function classifyQuery(query: string, llm?: LLMClient): Promise<ClassifiedQuery> {
  try {
    const client = llm ?? createLightClient();
    const raw = await client.complete(buildClassifyMessages(query), {
      temperature: 0,
      maxTokens: 200,
      json: true,
    });
    const parsed = extractJsonObject(raw);
    if (!parsed || !isIntent(parsed.intent)) {
      return {
        intent: 'factual',
        searchQuery: query,
        timeWindow: '不限',
        domain: '不限',
        source: 'fallback',
      };
    }
    const intent = parsed.intent;
    const searchQuery =
      typeof parsed.search_query === 'string' && parsed.search_query.trim()
        ? parsed.search_query.trim()
        : query;
    return {
      intent,
      searchQuery,
      timeWindow: typeof parsed.time_window === 'string' ? parsed.time_window : '不限',
      domain: typeof parsed.domain === 'string' ? parsed.domain : '不限',
      source: 'llm',
    };
  } catch (err) {
    return {
      intent: 'factual',
      searchQuery: query,
      timeWindow: '不限',
      domain: '不限',
      source: 'fallback',
      timedOut: isAbortError(err),
    };
  }
}
