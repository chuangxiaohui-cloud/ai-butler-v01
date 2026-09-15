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

export interface DecisionChoice {
  id: string;
  label: string;
  description?: string;
  outcome: 'approve' | 'reject';
}

export interface DecisionLogEntry {
  id: string;
  trigger: DecisionTrigger;
  /** 摆给用户的裁决问题 / 升级说明 */
  question?: string;
  /** option_clarify 的候选选项标签 */
  options?: string[];
  /** E396：多选一裁决的稳定机器值；普通批准/否决记录无需填写。 */
  choices?: DecisionChoice[];
  defaultChoice?: string;
  requiresConfirmation?: boolean;
  selectedChoice?: string;
  context?: { kind: string; [key: string]: unknown };
  decision: DecisionKind;
  note?: string;
  /** 裁决事件（approve/reject）指向被裁决的 pending 行 id；append-only 不改写原行 */
  refId?: string;
  /** E324：confirm 真阻断挂起的待批准动作载荷（仅阻断路径写入，批准后据此恢复执行） */
  resume?: { query: string; executor: string; intent?: string };
  conversationId?: string;
  confidence?: number;
  createdAt: number;
}

/** E323：人类裁决回填入参（§2.3 裁决结果记录） */
export interface AdjudicateInput {
  note?: string;
  conversationId?: string;
}

export type AdjudicationDecision = Extract<DecisionKind, 'approve' | 'reject'>;

export type AdjudicateResult =
  | { ok: true; entry: DecisionLogEntry; resume?: { query: string; executor: string; intent?: string } }
  | { ok: false; reason: 'not_found' | 'already_decided' | 'choice_required' | 'invalid_choice' };

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

  /** E336：全量裁决记录（append 顺序），供通知侧查询已裁决 refId */
  all(): DecisionLogEntry[] {
    return readJsonlCached(this.file, parseEntry);
  }

  /** E323：待裁决队列——decision=pending 且未被任何裁决事件（refId）指向的行，保持 append 顺序 */
  openDecisions(): DecisionLogEntry[] {
    const rows = readJsonlCached(this.file, parseEntry);
    const adjudicated = new Set(rows.flatMap((r) => (r.refId ? [r.refId] : [])));
    return rows.filter((r) => r.decision === 'pending' && !adjudicated.has(r.id));
  }

  /** E324：返回指定会话最近一条带 resume 的 open pending（confirm 阻断恢复用），无则 null */
  pendingForConversation(conversationId: string): DecisionLogEntry | null {
    const rows = readJsonlCached(this.file, parseEntry);
    const adjudicated = new Set(rows.flatMap((r) => (r.refId ? [r.refId] : [])));
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (
        row?.decision === 'pending' &&
        row.conversationId === conversationId &&
        row.resume &&
        !adjudicated.has(row.id)
      ) {
        return row;
      }
    }
    return null;
  }

  /**
   * E323：人类批准/否决回填（§2.3）——追加一条裁决事件（refId 指向原 pending 行，
   * 复制 question/options/confidence 自描述），不改写原行。pending 不存在或已被裁决返回失败原因。
   */
  adjudicate(
    id: string,
    decision: AdjudicationDecision,
    input: AdjudicateInput = {},
  ): AdjudicateResult {
    const rows = readJsonlCached(this.file, parseEntry);
    const target = rows.find((r) => r.id === id);
    if (!target || target.decision !== 'pending') {
      return { ok: false, reason: 'not_found' };
    }
    if (rows.some((r) => r.refId === id)) {
      return { ok: false, reason: 'already_decided' };
    }
    if (target.choices?.length) return { ok: false, reason: 'choice_required' };
    return this.appendAdjudication(target, decision, input);
  }

  /** E396：结构化多选一裁决；这里只追加证据，调用方可在记录成功后显式恢复受控动作。 */
  adjudicateChoice(
    id: string,
    selectedChoice: string,
    input: AdjudicateInput = {},
  ): AdjudicateResult {
    const rows = readJsonlCached(this.file, parseEntry);
    const target = rows.find((r) => r.id === id);
    if (!target || target.decision !== 'pending') return { ok: false, reason: 'not_found' };
    if (rows.some((r) => r.refId === id)) return { ok: false, reason: 'already_decided' };
    const choice = target.choices?.find((item) => item.id === selectedChoice);
    if (!choice) return { ok: false, reason: 'invalid_choice' };
    return this.appendAdjudication(target, choice.outcome, input, selectedChoice);
  }

  private appendAdjudication(
    target: DecisionLogEntry,
    decision: AdjudicationDecision,
    input: AdjudicateInput,
    selectedChoice?: string,
  ): AdjudicateResult {
    const entry = this.record({
      trigger: target.trigger,
      question: target.question,
      options: target.options,
      choices: target.choices,
      defaultChoice: target.defaultChoice,
      requiresConfirmation: target.requiresConfirmation,
      context: target.context,
      decision,
      refId: target.id,
      ...(selectedChoice ? { selectedChoice } : {}),
      note: input.note,
      conversationId: input.conversationId ?? target.conversationId,
      confidence: target.confidence,
    });
    return {
      ok: true,
      entry,
      ...(target.resume ? { resume: target.resume } : {}),
    };
  }

  close(): void {
    closeJsonl(this.file);
  }
}
