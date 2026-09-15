import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SkillCandidateEntry } from '../feedback/skill-candidate-store.js';
import { appendJsonl, closeJsonl, readJsonlCached } from '../log/jsonl.js';
import { AnswerPostprocessRuntime, type AnswerPostprocessResult } from './answer-postprocess.js';
import type { AnswerPostprocessContext, AnswerPostprocessRule } from './answer-postprocess.js';

export type AnswerPostprocessRuleStatus = 'enabled' | 'disabled';

export interface AnswerPostprocessRuleEntry {
  id: string;
  candidateId: string;
  userId: string;
  name: string;
  pattern: 'conclusion_first';
  status: AnswerPostprocessRuleStatus;
  usageCount: number;
  thumbsDownCount: number;
  consecutiveDown: number;
  needsReview: boolean;
  createdAt: number;
  updatedAt: number;
}

const REPO_RULE_LOG = join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'data',
  'answer-postprocess-rules.jsonl',
);

function parseEntry(line: string): AnswerPostprocessRuleEntry | null {
  try {
    const parsed = JSON.parse(line) as Partial<AnswerPostprocessRuleEntry>;
    const entry: AnswerPostprocessRuleEntry = {
      ...parsed,
      usageCount: parsed.usageCount ?? 0,
      thumbsDownCount: parsed.thumbsDownCount ?? 0,
      consecutiveDown: parsed.consecutiveDown ?? 0,
      needsReview: parsed.needsReview ?? false,
    } as AnswerPostprocessRuleEntry;
    return entry &&
      typeof entry.id === 'string' &&
      typeof entry.candidateId === 'string' &&
      typeof entry.userId === 'string' &&
      typeof entry.name === 'string' &&
      entry.pattern === 'conclusion_first' &&
      (entry.status === 'enabled' || entry.status === 'disabled') &&
      Number.isInteger(entry.usageCount) &&
      Number.isInteger(entry.thumbsDownCount) &&
      Number.isInteger(entry.consecutiveDown) &&
      typeof entry.needsReview === 'boolean' &&
      typeof entry.createdAt === 'number' &&
      typeof entry.updatedAt === 'number'
      ? entry
      : null;
  } catch {
    return null;
  }
}

export class AnswerPostprocessRuleStore {
  constructor(private readonly file = REPO_RULE_LOG) {}

  all(): AnswerPostprocessRuleEntry[] {
    return readJsonlCached(this.file, parseEntry);
  }

  latest(): AnswerPostprocessRuleEntry[] {
    const byId = new Map<string, AnswerPostprocessRuleEntry>();
    for (const entry of this.all()) {
      byId.delete(entry.id);
      byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }

  enable(candidate: SkillCandidateEntry, now = Date.now()): AnswerPostprocessRuleEntry | null {
    if (candidate.status !== 'accepted' || candidate.pattern !== 'conclusion_first') return null;
    const existing = this.latest().find(
      (entry) => entry.candidateId === candidate.id && entry.userId === candidate.userId,
    );
    if (existing?.status === 'enabled') return existing;
    const entry: AnswerPostprocessRuleEntry = existing
      ? { ...existing, status: 'enabled', updatedAt: now }
      : {
          id: randomUUID(),
          candidateId: candidate.id,
          userId: candidate.userId,
          name: `reply-${candidate.pattern.replace(/_/g, '-')}`,
          pattern: candidate.pattern,
          status: 'enabled',
          usageCount: 0,
          thumbsDownCount: 0,
          consecutiveDown: 0,
          needsReview: false,
          createdAt: now,
          updatedAt: now,
        };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  disable(id: string, userId: string, now = Date.now()): AnswerPostprocessRuleEntry | null {
    const existing = this.latest().find((entry) => entry.id === id && entry.userId === userId);
    if (!existing) return null;
    if (existing.status === 'disabled') return existing;
    const entry: AnswerPostprocessRuleEntry = { ...existing, status: 'disabled', updatedAt: now };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  recordUse(name: string, userId: string, now = Date.now()): AnswerPostprocessRuleEntry | null {
    const existing = this.latest().find((entry) => entry.name === name && entry.userId === userId);
    if (!existing) return null;
    const entry = { ...existing, usageCount: existing.usageCount + 1, updatedAt: now };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  /** §9.3：按回复级最新反馈同步；达到 [P-79] 只标记复审，不自动停用。 */
  syncReviewSignals(
    name: string,
    userId: string,
    thumbsDownCount: number,
    consecutiveDown: number,
    now = Date.now(),
  ): AnswerPostprocessRuleEntry | null {
    const existing = this.latest().find((entry) => entry.name === name && entry.userId === userId);
    if (!existing) return null;
    const entry: AnswerPostprocessRuleEntry = {
      ...existing,
      thumbsDownCount,
      consecutiveDown,
      needsReview: consecutiveDown >= 3 || existing.needsReview, // [P-79]
      updatedAt: now,
    };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  clearReview(id: string, userId: string, now = Date.now()): AnswerPostprocessRuleEntry | null {
    const existing = this.latest().find((entry) => entry.id === id && entry.userId === userId);
    if (!existing) return null;
    if (!existing.needsReview && existing.consecutiveDown === 0) return existing;
    const entry: AnswerPostprocessRuleEntry = {
      ...existing,
      consecutiveDown: 0,
      needsReview: false,
      updatedAt: now,
    };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  close(): void {
    closeJsonl(this.file);
  }
}

function compileRule(entry: AnswerPostprocessRuleEntry): AnswerPostprocessRule {
  return {
    name: entry.name,
    apply: (answer) => {
      if (/^(?:结论|建议|推荐)\s*[：:]/.test(answer.trimStart())) return answer;
      return `结论：${answer}`;
    },
  };
}

/** 每次执行读取当前用户最新 enabled 状态，启停无需重启 gateway。 */
export class PersistedAnswerPostprocessRuntime {
  constructor(
    private readonly store: Pick<AnswerPostprocessRuleStore, 'latest' | 'recordUse'>,
  ) {}

  apply(answer: string, context: AnswerPostprocessContext): AnswerPostprocessResult {
    const rules = this.store
      .latest()
      .filter((entry) => entry.userId === context.userId && entry.status === 'enabled')
      .map(compileRule);
    const result = new AnswerPostprocessRuntime(rules).apply(answer, context);
    for (const name of result.appliedSkillNames) this.store.recordUse(name, context.userId);
    return result;
  }
}
