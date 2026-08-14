/**
 * 路由 case 采集器（Phase 2/3）
 * query / 特征 / 候选 / 决策 落 JSONL，支持反馈回流与阈值校准建议。
 */

import { randomUUID } from 'crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';

import type { RouteResultV2 } from './router-v2.js';

export type RouteFeedback = 'accept' | 'reject' | 'correct';

export interface RouteCaseRecord {
  id: string;
  timestamp: number;
  query: string;
  userId?: string;
  source?: string;
  result: RouteResultV2;
  feedback?: RouteFeedback;
  correctedRoute?: { primaryLens?: string; intent?: string };
}

export interface RouteCaseMeta {
  userId?: string;
  source?: string;
}

export class RouteCaseStore {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), 'data', 'route-cases.jsonl')) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.filePath = filePath;
  }

  record(result: RouteResultV2, meta: RouteCaseMeta = {}): string {
    const record: RouteCaseRecord = {
      id: randomUUID(),
      timestamp: Date.now(),
      query: result.query,
      userId: meta.userId,
      source: meta.source,
      result,
    };
    appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf-8');
    return record.id;
  }

  list(): RouteCaseRecord[] {
    if (!existsSync(this.filePath)) return [];
    return readFileSync(this.filePath, 'utf-8')
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as RouteCaseRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is RouteCaseRecord => r !== null);
  }

  recordFeedback(
    id: string,
    feedback: RouteFeedback,
    correctedRoute?: { primaryLens?: string; intent?: string },
  ): boolean {
    const records = this.list();
    const index = records.findIndex((r) => r.id === id);
    if (index < 0) return false;
    records[index] = {
      ...records[index],
      feedback,
      ...(correctedRoute ? { correctedRoute } : {}),
    };
    writeFileSync(
      this.filePath,
      `${records.map((r) => JSON.stringify(r)).join('\n')}\n`,
      'utf-8',
    );
    return true;
  }

  stats(): {
    total: number;
    withFeedback: number;
    byDecision: Record<string, number>;
    byRule: Record<string, number>;
    feedbackCounts: Record<RouteFeedback, number>;
  } {
    const records = this.list();
    const byDecision: Record<string, number> = {};
    const byRule: Record<string, number> = {};
    const feedbackCounts: Record<RouteFeedback, number> = {
      accept: 0,
      reject: 0,
      correct: 0,
    };
    for (const record of records) {
      byDecision[record.result.decision.type] =
        (byDecision[record.result.decision.type] ?? 0) + 1;
      for (const candidate of record.result.candidates) {
        byRule[candidate.matchedRule] = (byRule[candidate.matchedRule] ?? 0) + 1;
      }
      if (record.feedback) feedbackCounts[record.feedback] += 1;
    }
    return {
      total: records.length,
      withFeedback: records.filter((r) => r.feedback).length,
      byDecision,
      byRule,
      feedbackCounts,
    };
  }
}
