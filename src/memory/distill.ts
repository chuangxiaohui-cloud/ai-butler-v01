/**
 * 项目侧 L1 蒸馏（v0.2b，E6 技术偏离）
 * DeepSeek + 本项目中文 prompt 从 L0 问答提取长期记忆，写入 ExperienceManager。
 * 背景：MemoryCore 内置 L1 prompt 与 DeepSeek 不兼容（见 bench/v02b-l1-extraction-issue.md）。
 */

import type { ChatMessage, LLMClient } from '../search/llm.js';
import { createHeavyClient } from '../search/llm.js';

export type DistilledType = 'persona' | 'episodic' | 'instruction';

export interface DistilledMemory {
  content: string;
  type: DistilledType;
  keywords: string[];
}

const DISTILL_SYSTEM_PROMPT = `你是记忆提取专家。从用户问答中提取值得长期记住的信息，只输出一个 JSON 数组，不要解释。
每个元素：{"content": "完整独立的记忆陈述（以用户为核心）", "type": "persona|episodic|instruction", "keywords": ["检索关键词"]}

规则：
- persona：用户稳定属性、偏好、习惯、常用工具/软件/流程。用户明确陈述偏好时必须提取；AI 转述的用户偏好同样提取。
- episodic：客观事件、决定、计划、完成结果。
- instruction：用户对 AI 的长期行为规则、格式/语气要求。
- 宁缺毋滥：琐碎闲聊、一次性操作不提取。
- "不用 X" 是偏好边界，不是对比事件。`;

export function buildDistillMessages(query: string, answer: string): ChatMessage[] {
  return [
    { role: 'system', content: DISTILL_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `用户问题：${query}\n\nAI 回答：${answer}`,
    },
  ];
}

export function parseDistill(raw: string): DistilledMemory[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
      content?: unknown;
      type?: unknown;
      keywords?: unknown;
    }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m) =>
          m &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0 &&
          (m.type === 'persona' || m.type === 'episodic' || m.type === 'instruction'),
      )
      .map((m) => ({
        content: String(m.content).trim(),
        type: m.type as DistilledType,
        keywords: Array.isArray(m.keywords)
          ? m.keywords.filter((k): k is string => typeof k === 'string').slice(0, 8)
          : [],
      }));
  } catch {
    return [];
  }
}

export async function distillRecord(
  record: { query: string; answer: string },
  llm?: LLMClient,
): Promise<DistilledMemory[]> {
  try {
    const client = llm ?? createHeavyClient();
    const raw = await client.complete(buildDistillMessages(record.query, record.answer), {
      temperature: 0,
      maxTokens: 600,
      json: true,
    });
    return parseDistill(raw);
  } catch {
    return []; // 蒸馏失败降级：不阻塞，不产出
  }
}
