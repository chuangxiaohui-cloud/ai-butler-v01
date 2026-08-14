/**
 * 用户上下文类型 + Memory 注入模板（Week 1 类型；Week 4 存储/衰减落地）
 */

import { PARAMS } from '../config/params.js';
import type { FactSource } from './confidence-decay.js';

export type { FactSource } from './confidence-decay.js';

export interface MemoryFact {
  content: string;
  source: FactSource;
  confidence: number;
  createdAt: number;
  lastAccessedAt: number;
  reviewCount: number;
}

export interface SessionSummary {
  sessionId: string;
  summary: string;
  topics: string[]; // 旧记录加载时回填 []
  createdAt: number;
}

export interface UserProfile {
  role: string;
  currentProjects: string[];
  preferences: {
    replyStyle: 'concise' | 'detailed' | 'secretary';
    tone: 'professional' | 'casual' | 'humorous';
  };
}

export interface UserContext {
  profile: UserProfile;
  recentSessions: SessionSummary[];
  longTermFacts: MemoryFact[];
}

/** 注入 prompt 前过滤低置信事实，按置信度排序并截断。 */
export function buildMemoryInjection(ctx: UserContext): string {
  const reliableFacts = ctx.longTermFacts
    .filter((f) => f.confidence >= PARAMS.injectMinConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, PARAMS.injectMaxFacts)
    .map((f) => `[${f.source === 'user_explicit' ? '✓' : '~'}] ${f.content}`);
  return [
    `【用户身份】${ctx.profile.role}`,
    `【当前项目】${ctx.profile.currentProjects.join('、')}`,
    `【可靠记忆】${reliableFacts.join('；')}`,
    `【近期上下文】${ctx.recentSessions.map((s) => s.summary).join('；')}`,
  ].join('\n');
}
