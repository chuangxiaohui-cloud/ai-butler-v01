/**
 * E309：人类裁决 / 困难升级记录（§2.3 人类裁决「交互层：选项卡片 + 裁决结果记录」）
 * append-only JSONL data/decision-log.jsonl：记录「摆了哪些选项给用户」「用户裁决结果」
 * （pending/approve/reject/escalate/resolved）与困难升级触发（低置信诚实/连续失败/连续纠正）。
 * 复用 P15 JSONL 追加工具（句柄复用 + 轮转 + 读缓存）。
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendJsonl, closeJsonl, readJsonlCached } from '../log/jsonl.js';

export type DecisionTrigger = 'human_arbitration' | 'escalation' | 'low_confidence';
export type DecisionKind = 'pending' | 'approve' | 'reject' | 'escalate' | 'resolved';

export interface DecisionLogEntry {
  id: string;
  trigger: DecisionTrigger;
  /** 摆给用户的裁决问题 / 升级说明 */
  question?: string;
  /** option_clarify 的候选选项标签 */
  options?: string[];
  decision: DecisionKind;
  note?: string;
  conversationId?: string;
  confidence?: number;
  createdAt: number;
}

/** 仓库 data/decision-log.jsonl（import.meta.url 锚定，独立于 runner 沙箱 cwd） */
const REPO_DECISION_LOG = join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'data',
  'decision-log.jsonl',
);

export function decisionLogPath(): string {
  return process.env.DECISION_LOG_PATH ?? REPO_DECISION_LOG;
}

function parseEntry(line: string): DecisionLogEntry | null {
  try {
    const e = JSON.parse(line) as DecisionLogEntry;
    return e && typeof e.id === 'string' ? e : null;
  } catch {
    return null;
  }
}

export class DecisionLog {
  private readonly file: string;

  constructor(filePath = decisionLogPath()) {
    this.file = filePath;
  }

  record(
    input: Omit<DecisionLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
  ): DecisionLogEntry {
    const entry: DecisionLogEntry = {
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: input.createdAt ?? Date.now(),
    };
    appendJsonl(this.file, JSON.stringify(entry));
    return entry;
  }

  recent(limit = 10): DecisionLogEntry[] {
    return readJsonlCached(this.file, parseEntry).slice(-limit);
  }

  close(): void {
    closeJsonl(this.file);
  }
}
