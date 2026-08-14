/**
 * Skill: knowledge-qa（文化梗/知识问答）
 * 有文本 LLM 时简洁作答；无 LLM 时仅对已知梗做最小兜底，不硬编百科。
 */

import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';
import type { SkillDeps } from '../deps.js';

function knownFallback(query: string): string | null {
  if (/小鸡啄米/.test(query)) {
    return '出自《唐伯虎点秋香》，“小鸡啄米”是华夫人府上众人跪地点头的经典桥段。';
  }
  if (/唐伯虎|周星驰|星爷/.test(query)) {
    return '指周星驰经典电影梗，常见于短视频和二创场景。';
  }
  return null;
}

export function createKnowledgeQaSkill(): ExecutableSkill {
  return {
    name: 'knowledge-qa',
    version: '0.1.0',
    triggers: ['梗', '名场面', 'meme', '唐伯虎', '周星驰', '星爷', '小鸡啄米', '典故', '出处'],
    async execute(input: SkillInput, deps: SkillDeps): Promise<SkillOutput> {
      if (deps.complete) {
        try {
          const raw = await deps.complete.complete(
            [
              {
                role: 'user',
                content: `简洁回答以下问题，不超过 120 字，不要写成百科词条：\n${input.query}`,
              },
            ],
            { temperature: 0.4, maxTokens: 200 },
          );
          return {
            result: { answer: raw.trim(), raw },
            confidence: 0.8,
            followUpAction: '需要结合你的短视频选题改编成脚本吗？',
          };
        } catch {
          // 落到已知梗兜底
        }
      }
      const fallback = knownFallback(input.query);
      return {
        result: {
          answer: fallback ?? '当前未接入知识库，暂时无法准确回答。',
        },
        confidence: fallback ? 0.5 : 0.2,
        followUpAction: fallback ? '想深入了解出处或改编成脚本，随时说。' : undefined,
      };
    },
  };
}
