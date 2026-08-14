/**
 * cultural_reference 专用后处理（Week 2）
 * Memory 驱动的动态组装：无上下文退化为精简百科，有上下文升级为贴身秘书。
 */

import type { UserContext } from '../memory/user-context.js';
import { toDisplayText } from '../skills/registry.js';

export interface CulturalReplyInput {
  skillOutput: { result: unknown };
  memory: UserContext | null;
  originalQuestion: string;
}

export function culturalReplyPostProcess(input: CulturalReplyInput): string {
  const resultText = toDisplayText(input.skillOutput.result);
  const { memory, originalQuestion } = input;
  const parts: string[] = [];

  if (!memory) {
    parts.push(`关于「${originalQuestion}」`);
    if (resultText) parts.push(resultText);
    return parts.join('\n');
  }

  const relatedFacts = memory.longTermFacts.filter((f) =>
    /周星驰|唐伯虎|影视梗|小鸡啄米/.test(f.content),
  );
  const recentRelated = memory.recentSessions.filter((s) =>
    s.topics.some((t) => /短视频|选题|梗|创作/.test(t)),
  );
  const prefersHumor = memory.profile.preferences.tone === 'humorous';

  parts.push(
    relatedFacts.length > 0 && prefersHumor
      ? '哈哈，你是想到星爷那段了吧？'
      : '"小鸡啄米图"出自《唐伯虎点秋香》的经典桥段。',
  );
  if (resultText) parts.push(resultText);
  if (recentRelated.length > 0) {
    parts.push('\n对了，你最近在做短视频/选题——这个"以低代高"的反转结构，要不要我帮你改编成脚本？');
  }
  return parts.join('\n');
}
