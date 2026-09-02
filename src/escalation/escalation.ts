/**
 * E309：§4.3.1 困难升级判定与文案
 * 连续失败 [P-47] / 用户连续纠正 [P-48] / 综合分低 [P-16]；
 * 三分支（能力不足 / 信息不足 / 工具不足）主动求助，禁止瞎编与盲目重试。
 */

import { PARAMS } from '../config/params.js';
import type { SessionTurn } from '../memory/session-context.js';

/** 用户纠正信号（连续 [P-48] 次触发停止当前方向）；锚定开头防误伤普通问句 */
const CORRECTION_RE =
  /^(?:不对|错了|不是这样|不是这个意思|你理解错了|理解反了|搞错了|说错了|重新来|重来|换个思路|还是不对|也不对|不对吧|好像不对|好像错了)/;

export function isUserCorrection(text: string): boolean {
  return CORRECTION_RE.test(text.trim());
}

/** 从会话轮次尾部倒序统计连续用户纠正（跳过 assistant 轮，遇非纠正 user 轮停止） */
export function countConsecutiveCorrections(turns: SessionTurn[]): number {
  let count = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role !== 'user') continue;
    if (!isUserCorrection(turn.text)) break;
    count += 1;
  }
  return count;
}

export type EscalationKind = 'capability' | 'information' | 'tool';

/** §4.3.1 困难升级三分支文案（能力不足 / 信息不足 / 工具不足） */
export function escalationMessage(kind: EscalationKind): string {
  switch (kind) {
    case 'capability':
      return '这个问题超出我的知识范围，我不再继续猜测。建议你咨询该领域的真人专家，或查阅官方文档/资料后再继续。';
    case 'information':
      return '我需要你提供更多信息才能继续分析（例如：具体型号、上下文、期望结果），你能补充一下吗？';
    case 'tool':
      return '这个任务需要额外的软件/工具才能完成，当前未接入。要我先帮你检查是否可安装，还是换一种方式？';
  }
}

/** 达到 [P-47] 连续失败：停止重试，主动建议求助（§4.3.1 能力不足分支） */
export function failureEscalationMessage(): string {
  return (
    `已连续 ${PARAMS.failureEscalationThreshold} 次尝试失败，我停止继续重试。` +
    escalationMessage('capability')
  );
}

/** 达到 [P-48] 连续纠正：停止当前方向，询问换思路（§4.3.1） */
export function correctionEscalationMessage(): string {
  return `你已经连续 ${PARAMS.correctionEscalationThreshold} 次说不对——我停下来不再重复同一思路。你觉得哪里不对？我换个方向。`;
}

/** 综合分 < [P-16]：明确告知「我不确定」，建议核实（§4.3.1 升级规则） */
export function lowConfidenceHonestMessage(confidence: number): string {
  return `> ⚠️ 综合分低于诚实阈值（${confidence.toFixed(2)} < ${PARAMS.confidenceDropThreshold.toFixed(2)}），我不确定以下回答，建议核实来源或咨询专业人士后再采信。`;
}
