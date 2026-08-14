import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { UserContext } from '../../src/memory/user-context.js';
import { culturalReplyPostProcess } from '../../src/postprocess/cultural-reply.js';

const memory: UserContext = {
  profile: {
    role: '一人公司创始人',
    currentProjects: ['短视频运营'],
    preferences: { replyStyle: 'secretary', tone: 'humorous' },
  },
  recentSessions: [
    {
      sessionId: 's1',
      summary: '讨论短视频选题',
      topics: ['短视频选题'],
      createdAt: Date.now(),
    },
  ],
  longTermFacts: [
    {
      content: '用户喜欢周星驰和唐伯虎点秋香',
      source: 'user_explicit',
      confidence: 0.9,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      reviewCount: 1,
    },
  ],
};

test('INT-004：有 Memory 时输出共鸣+精华+行动', () => {
  const out = culturalReplyPostProcess({
    skillOutput: { result: '以低代高的反转结构是经典笑点。' },
    memory,
    originalQuestion: '小鸡啄米图',
  });
  assert.ok(out.includes('星爷'));
  assert.ok(out.includes('以低代高'));
  assert.ok(out.includes('短视频'));
  assert.ok(out.includes('脚本'));
});

test('INT-004：无 Memory 时退化为精简百科，不给行动提议', () => {
  const out = culturalReplyPostProcess({
    skillOutput: { result: '以低代高的反转结构是经典笑点。' },
    memory: null,
    originalQuestion: '小鸡啄米图',
  });
  assert.ok(out.includes('小鸡啄米图'));
  assert.ok(!out.includes('脚本'));
});
