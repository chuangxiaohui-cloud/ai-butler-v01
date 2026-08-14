/**
 * 选项式消歧话术模板（§4.1 五镜片各自风格）
 * Layer 3 只取模板，不在业务代码里拼话术。
 */

import type { PrimaryLens } from './types.js';

export interface ClarifyTemplate {
  missingReferent: { question: string; optionPrefix: string };
  options: { question: string; optionPrefix: string };
  lowConfidence: { question: string };
}

export const CLARIFY_TEMPLATES: Record<PrimaryLens, ClarifyTemplate> = {
  secretary: {
    missingReferent: {
      question: '您提到的对象有点模糊，我想确认一下具体指哪个：',
      optionPrefix: '候选',
    },
    options: {
      question: '您想让我处理哪个方向？',
      optionPrefix: '方向',
    },
    lowConfidence: {
      question: '我没把握您要做什么，能再说具体一点吗？',
    },
  },
  owner: {
    missingReferent: {
      question: '老板，您指的是哪一个方案？',
      optionPrefix: '方案',
    },
    options: {
      question: '这个决定您想让我按哪个方向推进？',
      optionPrefix: '方向',
    },
    lowConfidence: {
      question: '您想确认的决策点我还没抓准，能补充一下背景吗？',
    },
  },
  project_manager: {
    missingReferent: {
      question: '这个任务的范围落在哪一块？',
      optionPrefix: '任务',
    },
    options: {
      question: '您希望我按哪个任务范围排期？',
      optionPrefix: '范围',
    },
    lowConfidence: {
      question: '任务边界还不清楚，能先明确目标和交付物吗？',
    },
  },
  product_manager: {
    missingReferent: {
      question: '您要落到哪份需求或文档上？',
      optionPrefix: '文档',
    },
    options: {
      question: '这份需求先按哪个方向起草？',
      optionPrefix: '方向',
    },
    lowConfidence: {
      question: '需求对象还不明确，能先补充一下场景吗？',
    },
  },
  architect: {
    missingReferent: {
      question: '您指的是哪个技术对象？',
      optionPrefix: '对象',
    },
    options: {
      question: '技术方案需要先拆哪个部分？',
      optionPrefix: '部分',
    },
    lowConfidence: {
      question: '技术边界还不清楚，能补充上下文或具体模块吗？',
    },
  },
};

export function clarifyTemplateFor(
  lens: PrimaryLens | undefined,
  kind: 'missingReferent',
): ClarifyTemplate['missingReferent'];
export function clarifyTemplateFor(
  lens: PrimaryLens | undefined,
  kind: 'options',
): ClarifyTemplate['options'];
export function clarifyTemplateFor(
  lens: PrimaryLens | undefined,
  kind: 'lowConfidence',
): ClarifyTemplate['lowConfidence'];
export function clarifyTemplateFor(
  lens: PrimaryLens | undefined,
  kind: 'missingReferent' | 'options' | 'lowConfidence',
): ClarifyTemplate['missingReferent'] | ClarifyTemplate['options'] | ClarifyTemplate['lowConfidence'] {
  const tpl = CLARIFY_TEMPLATES[lens ?? 'secretary'] ?? CLARIFY_TEMPLATES.secretary;
  return tpl[kind];
}
