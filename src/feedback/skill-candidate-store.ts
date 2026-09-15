import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendJsonl, closeJsonl, readJsonlCached } from '../log/jsonl.js';

export type CorrectionPatternKey =
  | 'conclusion_first'
  | 'structured_steps'
  | 'concise_style'
  | 'source_backed'
  | 'risk_first'
  | 'technical_precision';

export interface CorrectionPattern {
  key: CorrectionPatternKey;
  title: string;
  description: string;
}

export type SkillCandidateStatus = 'proposed' | 'accepted' | 'rejected';

export interface SkillCandidateEntry {
  id: string;
  userId: string;
  pattern: CorrectionPatternKey;
  title: string;
  description: string;
  sampleCount: number;
  latestSample: string;
  status: SkillCandidateStatus;
  createdAt: number;
  updatedAt: number;
}

type SkillCandidateInput = Omit<
  SkillCandidateEntry,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

const PATTERNS: Record<CorrectionPatternKey, CorrectionPattern> = {
  conclusion_first: {
    key: 'conclusion_first',
    title: '结论优先回复',
    description: '回复开头先给结论或明确建议。',
  },
  structured_steps: {
    key: 'structured_steps',
    title: '分步结构化回复',
    description: '将执行建议整理为有序步骤。',
  },
  concise_style: {
    key: 'concise_style',
    title: '简洁直接回复',
    description: '减少铺垫，只保留关键结论。',
  },
  source_backed: {
    key: 'source_backed',
    title: '证据优先回复',
    description: '回答时附上来源、证据或参考链接。',
  },
  risk_first: {
    key: 'risk_first',
    title: '风险前置回复',
    description: '执行建议前先说明风险或确认项。',
  },
  technical_precision: {
    key: 'technical_precision',
    title: '技术参数精确回复',
    description: '工程回答优先核对具体器件、接口或参数。',
  },
};

const REPO_CANDIDATE_LOG = join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'data',
  'skill-candidates.jsonl',
);

/** 仅识别可解释、可重复计算的显式修订模式。 */
export function detectCorrectionPattern(
  _originalAnswer: string,
  correctedAnswer: string,
): CorrectionPattern | null {
  const corrected = correctedAnswer.trim();
  if (/^(?:先说)?结论\s*[：:，,。.]|^(?:建议|推荐)\s*[：:]/.test(corrected)) {
    return PATTERNS.conclusion_first;
  }
  const stepMarkers = corrected.match(/^(?:\d+[.)、]|[一二三四五六七八九十]+[、.])\s*/gm) ?? [];
  if (stepMarkers.length >= 2) return PATTERNS.structured_steps;
  if (/简要|简洁|一句话|只给|直接回答/.test(corrected)) return PATTERNS.concise_style;
  if (/来源|证据|引用|参考链接/.test(corrected)) return PATTERNS.source_backed;
  if (/^(?:注意|风险|先确认)\s*[：:，,。.]?/.test(corrected)) return PATTERNS.risk_first;
  if (/STM32|芯片|电路|固件|代码|接口|寄存器|电压|电流|温度|频率/i.test(corrected)) {
    return PATTERNS.technical_precision;
  }
  return null;
}

function parseEntry(line: string): SkillCandidateEntry | null {
  try {
    const entry = JSON.parse(line) as SkillCandidateEntry;
    return entry &&
      typeof entry.id === 'string' &&
      typeof entry.userId === 'string' &&
      typeof entry.pattern === 'string' &&
      Object.hasOwn(PATTERNS, entry.pattern) &&
      typeof entry.title === 'string' &&
      typeof entry.description === 'string' &&
      typeof entry.sampleCount === 'number' &&
      typeof entry.latestSample === 'string' &&
      (entry.status === 'proposed' || entry.status === 'accepted' || entry.status === 'rejected') &&
      typeof entry.createdAt === 'number' &&
      typeof entry.updatedAt === 'number'
      ? entry
      : null;
  } catch {
    return null;
  }
}

export class SkillCandidateStore {
  constructor(private readonly file = REPO_CANDIDATE_LOG) {}

  all(): SkillCandidateEntry[] {
    return readJsonlCached(this.file, parseEntry);
  }

  latest(): SkillCandidateEntry[] {
    const byId = new Map<string, SkillCandidateEntry>();
    for (const entry of this.all()) {
      byId.delete(entry.id);
      byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }

  propose(input: SkillCandidateInput, now = Date.now()): SkillCandidateEntry {
    const existing = this.latest().find(
      (entry) => entry.userId === input.userId && entry.pattern === input.pattern,
    );
    if (existing) return existing;
    const entry: SkillCandidateEntry = {
      ...input,
      id: randomUUID(),
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
    };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  decide(
    id: string,
    status: Exclude<SkillCandidateStatus, 'proposed'>,
    now = Date.now(),
  ): SkillCandidateEntry | null {
    const current = this.latest().find((entry) => entry.id === id);
    if (!current) return null;
    if (current.status === status) return current;
    const entry = { ...current, status, updatedAt: now };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  close(): void {
    closeJsonl(this.file);
  }
}
