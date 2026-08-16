/**
 * TrajectoryLog：对齐 DeepSeek Harness 的 append-only 轨迹设计。
 * 模型看到什么、路由怎么判、命中哪些技能、搜索与合成结果如何，
 * 都汇入同一条只追加 JSONL，供调试、回放和评估复用。
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface TrajectoryRoute {
  decisionType: string;
  primaryLens?: string;
  intent?: string;
  confidence: number;
  executor?: string;
  matchedRules: string[];
}

export interface TrajectorySkill {
  name: string;
  version: string;
  kind: 'direct' | 'injected';
  outputSnippet: string;
}

export interface TrajectorySearch {
  query: string;
  resultCount: number;
  aiAnswerCount: number;
  degraded: boolean;
  latencyMs: number;
}

export interface TrajectorySynthesize {
  source: 'llm' | 'fallback';
  evidenceCount: number;
}

export interface TrajectoryModelRoute {
  tier: string;
  provider: string;
  model: string;
  fallbacks: Array<{ from: string; to: string }>;
}

export interface TrajectoryAnswer {
  answerSnippet: string;
  confidence: number;
  gateTriggered: string;
  elapsedMs: number;
}

export type TrajectoryEvent =
  | { type: 'route'; sessionId: string; route: TrajectoryRoute }
  | { type: 'skill'; sessionId: string; skill: TrajectorySkill }
  | { type: 'search'; sessionId: string; search: TrajectorySearch }
  | { type: 'synthesize'; sessionId: string; synthesize: TrajectorySynthesize }
  | { type: 'model_route'; sessionId: string; modelRoute: TrajectoryModelRoute }
  | { type: 'answer'; sessionId: string; answer: TrajectoryAnswer };

export type TrajectoryEventBody =
  | { type: 'route'; route: TrajectoryRoute }
  | { type: 'skill'; skill: TrajectorySkill }
  | { type: 'search'; search: TrajectorySearch }
  | { type: 'synthesize'; synthesize: TrajectorySynthesize }
  | { type: 'model_route'; modelRoute: TrajectoryModelRoute }
  | { type: 'answer'; answer: TrajectoryAnswer };

export interface TrajectoryLogLike {
  record(event: TrajectoryEvent): void;
}

export class TrajectoryLog implements TrajectoryLogLike {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), 'data', 'trajectory.jsonl')) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.filePath = filePath;
  }

  record(event: TrajectoryEvent): void {
    appendFileSync(
      this.filePath,
      `${JSON.stringify({ id: randomUUID(), timestamp: Date.now(), ...event })}\n`,
      'utf-8',
    );
  }
}
