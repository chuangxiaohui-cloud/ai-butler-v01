/**
 * Stage 5 秘书级合成（§6.0/§6.7）
 * 重模型基于融合证据生成中文秘书答案；超时降级为证据摘要，禁止无证据硬答。
 */

import type { LLMClient } from '../llm.js';
import { createHeavyClient } from '../llm.js';
import type { FusedOutput } from '../fusion.js';
import type { ClassifiedQuery } from './s2_classify.js';
import type { PrimaryLens } from '../../agent/types.js';
import { isRecencySensitiveQuery } from '../recency.js';

export interface SynthesizeOptions {
  llm?: LLMClient;
  serious?: boolean;
  memoryNotes?: string[];
  aiAnswers?: string[];
  experienceNotes?: string[];
  skillHints?: string[];
  skillOutputs?: string[];
  primaryLens?: PrimaryLens;
}

export interface SynthesizeResult {
  answer: string;
  source: 'llm' | 'fallback';
}

function todayLabel(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function multiIntentFallback(query: string): string | null {
  const hasWeather = /天气|气温|下雨|晴|阴/.test(query);
  const hasChip = /芯片|元器件|CH\d|买|卖|库存|替代/.test(query);
  if (!hasWeather || !hasChip) return null;
  return `这个问题包含两个部分，我分开处理：\n` +
    `1. 天气：需要您补充城市/地点（例如“华强北”在深圳福田），我按实时天气源查；\n` +
    `2. 芯片库存/替代：我可以继续查立创商城、华强北渠道或原厂，您把具体型号和地区确认一下，我马上查。`;
}

function buildSystemPrompt(serious: boolean, primaryLens?: PrimaryLens, query?: string): string {
  const lines = [
    '你是「她」，一位拥有三十年经验的老专家兼贴身女秘书。',
    `今天是 ${todayLabel()}。`,
  ];
  if (primaryLens) {
    lines.push(`当前主镜片：${primaryLens}`);
  }
  lines.push(
    '回答要求：',
    '1. 结论先行，语气温暖自然，像跟老板说话；',
    '2. 只依据下方证据回答，不得编造事实、数字、来源；',
    '3. 证据不足时明确说明，不要硬答；',
    '4. 引用来源时自然带上链接。',
  );
  if (serious) {
    lines.push('5. 本问题属医疗/税务等严肃领域，必须谨慎，并在结尾提示以官方或专业人士判断为准。');
  }
  if (query && isRecencySensitiveQuery(query)) {
    lines.push(
      '时效红线：本题询问“现在/当前/最新”状态，必须把每条证据的发布日期与今天对比；' +
        '只有足够新的证据才能当现状，旧闻只能作背景；' +
        '若没有足够新的证据，明确说明“截至今天暂无可靠更新”，不要拿旧闻冒充现状。',
    );
  }
  lines.push('6. 若用户明确要求举例或写代码示例，请给出简短、可运行的示例代码，并标注为示例；不要只给文字描述。');
  return lines.join('\n');
}

export async function synthesizeAnswer(
  query: string,
  fused: FusedOutput,
  classified: ClassifiedQuery,
  opts: SynthesizeOptions = {},
): Promise<SynthesizeResult> {
  if (fused.items.length === 0) {
    const multi = multiIntentFallback(query);
    return {
      answer: multi ?? '我暂时无法确认这个问题。建议查阅官方源或补充更多信息，我再帮你查。',
      source: 'fallback',
    };
  }

  const evidenceBlock = fused.items
    .map(
      (f, i) =>
        `[${i + 1}] ${f.result.title}（${f.result.url}，发布于 ${f.result.published ?? '未知'}）\n${f.result.content.slice(0, 300)}`,
    )
    .join('\n\n');
  const memoryBlock =
    (opts.memoryNotes ?? []).length > 0
      ? `\n\n历史记忆（仅作参考，以最新证据为准）：\n${(opts.memoryNotes ?? [])
          .map((n) => `- ${n}`)
          .join('\n')}`
      : '';
  const aiAnswerBlock =
    (opts.aiAnswers ?? []).length > 0
      ? `\n\nAI Answer（Tavily，高置信软事实候选，须优先核对）：\n${(opts.aiAnswers ?? [])
          .slice(0, 2)
          .map((a) => `- ${a.slice(0, 500)}`)
          .join('\n')}`
      : '';
  const experienceBlock =
    (opts.experienceNotes ?? []).length > 0
      ? `\n\n项目经验（仅作参考，以最新证据为准）：\n${(opts.experienceNotes ?? [])
          .map((n) => `- ${n}`)
          .join('\n')}`
      : '';
  const skillBlock =
    (opts.skillHints ?? []).length > 0
      ? `\n\n命中技能（可辅助回答）：${(opts.skillHints ?? []).join('、')}`
      : '';
  const skillOutputBlock =
    (opts.skillOutputs ?? []).length > 0
      ? `\n\n技能深度分析（仅作参考，须与证据核对）：\n${(opts.skillOutputs ?? [])
          .map((n) => `- ${n}`)
          .join('\n')}`
      : '';
  const messages = [
    {
      role: 'system' as const,
      content: buildSystemPrompt(opts.serious ?? false, opts.primaryLens, query),
    },
    {
      role: 'user' as const,
      content: `问题：${query}\n意图：${classified.intent}${memoryBlock}${aiAnswerBlock}${experienceBlock}${skillBlock}${skillOutputBlock}\n\n证据：\n${evidenceBlock}`,
    },
  ];

  try {
    const client = opts.llm ?? createHeavyClient();
    const raw = await client.complete(messages, { maxTokens: 800, temperature: 0.3 });
    const answer = raw.trim();
    if (!answer) throw new Error('空答案');
    return { answer, source: 'llm' };
  } catch {
    const summary = fused.items
      .slice(0, 3)
      .map((f) => `${f.result.title}（${f.result.url}）`)
      .join('；');
    return {
      answer: `搜索到了 ${fused.items.length} 条相关结果，其中较可信的包括：${summary}。`,
      source: 'fallback',
    };
  }
}
