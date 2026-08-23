/**
 * 路由 case 采集器（Phase 2/3）
 * query / 特征 / 候选 / 决策 落 JSONL，支持反馈回流与阈值校准建议。
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { appendJsonl } from '../log/jsonl.js';
import type { RouteResultV2 } from './router-v2.js';

export type RouteFeedback = 'accept' | 'reject' | 'correct';

export interface ModelRouteRecord {
  tier: string;
  provider: string;
  model: string;
  fallbacks: Array<{ from: string; to: string }>;
  at: number;
}

export interface RouteCaseRecord {
  id: string;
  timestamp: number;
  query: string;
  userId?: string;
  source?: string;
  result: RouteResultV2;
  feedback?: RouteFeedback;
  correctedRoute?: { primaryLens?: string; intent?: string };
  modelRoute?: ModelRouteRecord;
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
    // P13：共享 JSONL 追加（句柄复用 + [P-113] 轮转），O(1)/事件
    appendJsonl(this.filePath, JSON.stringify(record));
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
    return this.updateRecord(id, (record) => ({
      ...record,
      feedback,
      ...(correctedRoute ? { correctedRoute } : {}),
    }));
  }

  attachModelRoute(id: string, modelRoute: ModelRouteRecord): boolean {
    return this.updateRecord(id, (record) => ({ ...record, modelRoute }));
  }

  /**
   * 批量回写反馈（P13）：单趟读 + 单趟写，batch-mark 不再 O(m×n) 循环全文重写。
   * 同步 fs 读改写在同一进程内天然串行，不会与 record() 追加交错丢行。
   */
  batchMarkFeedback(
    updates: Array<{
      id: string;
      feedback: RouteFeedback;
      correctedRoute?: { primaryLens?: string; intent?: string };
    }>,
  ): { updated: string[]; failed: string[] } {
    const records = this.list();
    const byId = new Map(records.map((r) => [r.id, r]));
    const updated: string[] = [];
    const failed: string[] = [];
    for (const update of updates) {
      const record = byId.get(update.id);
      if (!record) {
        failed.push(update.id);
        continue;
      }
      record.feedback = update.feedback;
      if (update.correctedRoute) record.correctedRoute = update.correctedRoute;
      updated.push(update.id);
    }
    if (updated.length > 0) this.rewriteAll(records);
    return { updated, failed };
  }

  /** 单条读改写的唯一出口：读全量 → 更新一条 → 整文件重写 */
  private updateRecord(
    id: string,
    update: (record: RouteCaseRecord) => RouteCaseRecord,
  ): boolean {
    const records = this.list();
    const index = records.findIndex((r) => r.id === id);
    if (index < 0) return false;
    records[index] = update(records[index]);
    this.rewriteAll(records);
    return true;
  }

  private rewriteAll(records: RouteCaseRecord[]): void {
    writeFileSync(
      this.filePath,
      `${records.map((r) => JSON.stringify(r)).join('\n')}\n`,
      'utf-8',
    );
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
