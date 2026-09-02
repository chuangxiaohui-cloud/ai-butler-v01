/**
 * E309：会话级困难升级计数（§4.3.1 [P-47] 连续失败）
 * append-only JSONL data/escalation-state.jsonl（kind: failure | success），
 * 同一会话连续失败 ≥ [P-47] 时 pipeline 入口触发「停止重试，主动建议求助」。
 * 纠正计数（[P-48]）直接由会话轮次计算（escalation.ts），不落此文件。
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARAMS } from '../config/params.js';
import { appendJsonl, closeJsonl, readJsonlCached } from '../log/jsonl.js';

export type EscalationEventKind = 'failure' | 'success';

export interface EscalationEvent {
  conversationId: string;
  kind: EscalationEventKind;
  note?: string;
  createdAt: number;
}

/** 仓库 data/escalation-state.jsonl（import.meta.url 锚定，独立于 runner 沙箱 cwd） */
const REPO_ESCALATION_STATE = join(
  fileURLToPath(new URL('../../', import.meta.url)),
  'data',
  'escalation-state.jsonl',
);

export function escalationStatePath(): string {
  return process.env.ESCALATION_STATE_PATH ?? REPO_ESCALATION_STATE;
}

function parseEvent(line: string): EscalationEvent | null {
  try {
    const e = JSON.parse(line) as EscalationEvent;
    return e && typeof e.conversationId === 'string' ? e : null;
  } catch {
    return null;
  }
}

export class EscalationState {
  private readonly file: string;

  constructor(filePath = escalationStatePath()) {
    this.file = filePath;
  }

  recordFailure(conversationId: string, note?: string): void {
    this.append(conversationId, 'failure', note);
  }

  recordSuccess(conversationId: string, note?: string): void {
    this.append(conversationId, 'success', note);
  }

  /** 该会话最近连续失败次数（遇 success 归零；无记录返回 0） */
  consecutiveFailures(conversationId: string): number {
    const events = readJsonlCached(this.file, parseEvent);
    let count = 0;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e.conversationId !== conversationId) continue;
      if (e.kind === 'success') break;
      count += 1;
    }
    return count;
  }

  /** 该会话连续失败是否已达 [P-47] 停止重试阈值 */
  failureThresholdReached(conversationId: string): boolean {
    return this.consecutiveFailures(conversationId) >= PARAMS.failureEscalationThreshold;
  }

  private append(conversationId: string, kind: EscalationEventKind, note?: string): void {
    appendJsonl(
      this.file,
      JSON.stringify({ conversationId, kind, note, createdAt: Date.now() }),
    );
  }

  close(): void {
    closeJsonl(this.file);
  }
}
