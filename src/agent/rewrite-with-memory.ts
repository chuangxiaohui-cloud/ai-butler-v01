/**
 * rewrite 意图的近期记忆回溯与文本润色。
 * 从工作记忆中的 Q→A 条目取出用户原文，交给文本 LLM 改写；
 * 没有原文或没有 LLM 时返回 null，由管道保留原澄清话术。
 */

import type { LLMClient } from '../search/llm.js';

const INLINE_SOURCE_RE =
  /(?:重写|润色|改写|润饰)\s*(?:这句话|这段话|内容|原文)?[：:]\s*([^\n]+)/;
const QUOTED_SOURCE_RE = /[“"]([^”"]+)[”"]/;
const MEMORY_Q_RE = /Q:\s*([^→\n]{1,500})/;

export function extractRewriteSource(
  query: string,
  contextHints: string[] = [],
): string | null {
  const inline = query.match(INLINE_SOURCE_RE);
  if (inline?.[1]?.trim()) return inline[1].trim();

  const quoted = query.match(QUOTED_SOURCE_RE);
  if (quoted?.[1]?.trim()) return quoted[1].trim();

  for (const hint of contextHints) {
    const m = hint.match(MEMORY_Q_RE);
    const source = m?.[1]?.trim();
    if (source && !source.includes('【')) return source;
  }
  return null;
}

export async function rewriteWithMemory(
  query: string,
  contextHints: string[],
  complete: LLMClient | undefined,
): Promise<string | null> {
  const source = extractRewriteSource(query, contextHints);
  if (!source || !complete) return null;
  try {
    const raw = await complete.complete(
      [
        {
          role: 'user',
          content:
            '你是资深中文润色助手。请把下面的原文按用户要求重写，保持事实不变。\n' +
            '用户要求：' +
            query +
            '\n\n原文：\n' +
            source +
            '\n\n只输出改写后的内容，不要解释，不要加开场白。',
        },
      ],
      { temperature: 0.4, maxTokens: 800 },
    );
    const answer = raw.trim();
    return answer || null;
  } catch {
    return null;
  }
}
