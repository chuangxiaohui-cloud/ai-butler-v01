/**
 * Tavily 条件并联触发判定（§6.2.1）
 * 实时查询 / 英文技术查询 / 低置信提示；医疗/政务严肃通道为禁区，不触发。
 */

import type { IntentKey } from './stages/s2_classify.js';

export type TavilyTrigger = 'news' | 'english' | 'low_confidence_hint' | null;

const ENGLISH_RE = /[A-Za-z]{2,}/;
const LOW_CONFIDENCE_HINT_RE = /(经验|踩坑|注意事项|失败|无应答|卡死|教程|配置|对比)/;

export function shouldTriggerTavily(
  query: string,
  intent: IntentKey,
  serious: boolean,
): TavilyTrigger {
  if (serious) return null; // 医疗/政务禁区
  if (intent === 'news') return 'news';
  if (
    LOW_CONFIDENCE_HINT_RE.test(query) &&
    (intent === 'experience' || intent === 'troubleshooting')
  ) {
    return 'low_confidence_hint';
  }
  if (ENGLISH_RE.test(query)) return 'english';
  return null;
}
