import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendJsonl, closeJsonl, readJsonlCached } from '../log/jsonl.js';
import type { PersonaMemoryScope } from '../memory/persona-memory.js';

export type AnswerFeedback = 'accept' | 'reject' | 'correct';
export const ANSWER_FEEDBACK_REASONS = [
  'irrelevant',
  'too_verbose',
  'technical_error',
  'missing_key_point',
] as const;
export type AnswerFeedbackReason = (typeof ANSWER_FEEDBACK_REASONS)[number];

const ANSWER_FEEDBACK_REASON_LABELS: Record<AnswerFeedbackReason, string> = {
  irrelevant: '答非所问',
  too_verbose: '太啰嗦',
  technical_error: '技术错误',
  missing_key_point: '漏了重点',
};

export interface DailyFeedbackSummary {
  accept: number;
  reject: number;
  correct: number;
  total: number;
  topRejectReason?: AnswerFeedbackReason;
  text: string;
}

export function isAnswerFeedbackReason(value: unknown): value is AnswerFeedbackReason {
  return ANSWER_FEEDBACK_REASONS.includes(value as AnswerFeedbackReason);
}

export interface AnswerFeedbackEntry {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string;
  mode: PersonaMemoryScope;
  query: string;
  answer: string;
  skillName?: string;
  postprocessSkillNames?: string[];
  feedback: AnswerFeedback;
  reason?: AnswerFeedbackReason;
  note?: string;
  correctedAnswer?: string;
  createdAt: number;
}

type AnswerFeedbackInput = Omit<AnswerFeedbackEntry, 'id' | 'createdAt'>;

const REPO_FEEDBACK_LOG = join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'data',
  'answer-feedback.jsonl',
);

function parseEntry(line: string): AnswerFeedbackEntry | null {
  try {
    const entry = JSON.parse(line) as AnswerFeedbackEntry;
    return entry &&
      typeof entry.id === 'string' &&
      typeof entry.userId === 'string' &&
      typeof entry.messageId === 'string' &&
      (entry.skillName === undefined || typeof entry.skillName === 'string') &&
      (entry.postprocessSkillNames === undefined ||
        (Array.isArray(entry.postprocessSkillNames) &&
          entry.postprocessSkillNames.every((name) => typeof name === 'string' && name.length > 0))) &&
      (entry.reason === undefined || isAnswerFeedbackReason(entry.reason)) &&
      (entry.note === undefined || typeof entry.note === 'string') &&
      (entry.correctedAnswer === undefined || typeof entry.correctedAnswer === 'string') &&
      (entry.feedback === 'accept' || entry.feedback === 'reject' || entry.feedback === 'correct')
      ? entry
      : null;
  } catch {
    return null;
  }
}

export class FeedbackStore {
  constructor(private readonly file = REPO_FEEDBACK_LOG) {}

  record(input: AnswerFeedbackInput, now = Date.now()): AnswerFeedbackEntry {
    const entry: AnswerFeedbackEntry = {
      ...input,
      id: randomUUID(),
      createdAt: now,
    };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  all(): AnswerFeedbackEntry[] {
    return readJsonlCached(this.file, parseEntry);
  }

  /** 同一用户对同一回复可改票；审计保留全部事件，统计只取最后一次。 */
  latest(): AnswerFeedbackEntry[] {
    const byMessage = new Map<string, AnswerFeedbackEntry>();
    for (const entry of this.all()) {
      const key = `${entry.userId}:${entry.conversationId}:${entry.messageId}`;
      byMessage.delete(key);
      byMessage.set(key, entry);
    }
    return [...byMessage.values()];
  }

  stats(): {
    accept: number;
    reject: number;
    correct: number;
    total: number;
    acceptanceRate: number | null;
  } {
    const latest = this.latest();
    const accept = latest.filter((entry) => entry.feedback === 'accept').length;
    const reject = latest.filter((entry) => entry.feedback === 'reject').length;
    const correct = latest.filter((entry) => entry.feedback === 'correct').length;
    return {
      accept,
      reject,
      correct,
      total: latest.length,
      acceptanceRate: latest.length > 0 ? accept / latest.length : null,
    };
  }

  dailySummary(userId: string, now = Date.now()): DailyFeedbackSummary {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const entries = this.latest().filter(
      (entry) =>
        entry.userId === userId &&
        entry.createdAt >= start.getTime() &&
        entry.createdAt < end.getTime(),
    );
    const accept = entries.filter((entry) => entry.feedback === 'accept').length;
    const reject = entries.filter((entry) => entry.feedback === 'reject').length;
    const correct = entries.filter((entry) => entry.feedback === 'correct').length;
    const reasonCounts = new Map<AnswerFeedbackReason, number>();
    for (const entry of entries) {
      if (entry.feedback === 'reject' && entry.reason) {
        reasonCounts.set(entry.reason, (reasonCounts.get(entry.reason) ?? 0) + 1);
      }
    }
    const topRejectReason = ANSWER_FEEDBACK_REASONS.reduce<AnswerFeedbackReason | undefined>(
      (top, reason) =>
        (reasonCounts.get(reason) ?? 0) > (top ? (reasonCounts.get(top) ?? 0) : 0)
          ? reason
          : top,
      undefined,
    );
    const total = entries.length;
    const text = total === 0
      ? '今天还没有收到回复反馈。'
      : `今天收到 ${reject} 个👎、${accept} 个👍、${correct} 条修改建议${
          topRejectReason ? `，主要原因是“${ANSWER_FEEDBACK_REASON_LABELS[topRejectReason]}”` : ''
        }。`;
    return {
      accept,
      reject,
      correct,
      total,
      ...(topRejectReason ? { topRejectReason } : {}),
      text,
    };
  }

  close(): void {
    closeJsonl(this.file);
  }
}
