/**
 * 用户上下文类型（Week 1 仅类型；存储/衰减 Week 4 实现）
 */

export type FactSource = 'user_explicit' | 'inferred' | 'corrected';

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
