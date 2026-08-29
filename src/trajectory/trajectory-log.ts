/**
 * TrajectoryLog：对齐 DeepSeek Harness 的 append-only 轨迹设计。
 * 模型看到什么、路由怎么判、命中哪些技能、搜索与合成结果如何，
 * 都汇入同一条只追加 JSONL，供调试、回放和评估复用。
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appendJsonl, closeJsonl } from '../log/jsonl.js';

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
  kind: 'direct' | 'injected' | 'market_trigger';
  outputSnippet: string;
  /** P1：direct skill 总耗时与内部阶段耗时（github-reader 等埋点） */
  durationMs?: number;
  fetchMs?: number;
  synthesisMs?: number;
  synthesisError?: string;
}

export interface TrajectorySearch {
  query: string;
  resultCount: number;
  aiAnswerCount: number;
  degraded: boolean;
  latencyMs: number;
  /** E280：本次管道的实际检索子查询（含数值增强子查询），供召回/融合故障分层定位 */
  subQueries?: string[];
}

export interface TrajectorySynthesize {
  source: 'llm' | 'fallback';
  evidenceCount: number;
  error?: string;
  readiness?: { kind: string; ready: boolean; gap?: string };
  /** M6 探针：低置信二次取证抓正文耗时 */
  secondPassMs?: number;
  /** M6 探针：P0 知识正文抓取耗时 */
  contentFetchMs?: number;
  /** M6 探针：数值补检索耗时 */
  supplementMs?: number;
  /** M6 探针：Stage 5 合成 LLM 调用耗时 */
  synthesisMs?: number;
}

export interface TrajectoryDiagnoseItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  hasNumeric: boolean;
  cooccurs: boolean;
  /** E275：发布日期（回放保真；AnySearch/Bocha 常缺省） */
  published?: string;
  /** E275：完整正文（DIAGNOSE_NUMERIC=1 本地回放校准用，dev-only） */
  fullContent?: string;
  /** E275：全文「数字+量级单位」独立数值计数（密度加权诊断） */
  numericCount?: number;
}

/** E275 诊断：候选池 vs evidence 对照（DIAGNOSE_NUMERIC=1 时记录） */
export interface TrajectoryDiagnose {
  stage: 'candidates' | 'evidence';
  items: TrajectoryDiagnoseItem[];
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
  | { type: 'diagnose'; sessionId: string; diagnose: TrajectoryDiagnose }
  | { type: 'synthesize'; sessionId: string; synthesize: TrajectorySynthesize }
  | { type: 'model_route'; sessionId: string; modelRoute: TrajectoryModelRoute }
  | { type: 'answer'; sessionId: string; answer: TrajectoryAnswer };

export type TrajectoryEventBody =
  | { type: 'route'; route: TrajectoryRoute }
  | { type: 'skill'; skill: TrajectorySkill }
  | { type: 'search'; search: TrajectorySearch }
  | { type: 'diagnose'; diagnose: TrajectoryDiagnose }
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
    appendJsonl(
      this.filePath,
      JSON.stringify({ id: randomUUID(), timestamp: Date.now(), ...event }),
    );
  }

  /** P15：关闭底层文件句柄（进程退出/测试清理用） */
  close(): void {
    closeJsonl(this.filePath);
  }
}
