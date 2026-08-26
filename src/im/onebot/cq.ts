/**
 * OneBot 消息文本提取（E241）
 * CQ 码（如 [CQ:image,file=xxx]）只剥离不执行：图片/文件/语音等一律不下载不处理，
 * 只保留 text 文本进问答（§10 安全边界：IM 通道为只读文本输入）。
 */

import type { OneBotMessage } from './types.js';

const CQ_RE = /\[CQ:[^\]]*\]/g;
/** OneBot CQ 码转义：&amp; &#91; &#93; */
const UNESCAPE: Array<[RegExp, string]> = [
  [/&amp;/g, '&'],
  [/&#91;/g, '['],
  [/&#93;/g, ']'],
];

/** 从消息段数组提取纯文本 */
export function segmentsToText(segments: Array<{ type: string; data?: Record<string, unknown> }>): string {
  return segments
    .filter((s) => s && s.type === 'text' && typeof s.data?.text === 'string')
    .map((s) => s.data!.text as string)
    .join('')
    .trim();
}

/** 从 OneBot 消息（字符串或段数组）提取纯文本：剥 CQ 码 + 反转义 */
export function extractOneBotText(message: OneBotMessage | undefined): string {
  if (message === undefined) return '';
  if (Array.isArray(message)) return segmentsToText(message);
  let text = message.replace(CQ_RE, '');
  // CQ 码剥离后常留下连续空格（"你好 [CQ:at] 世界"），折叠为单空格避免干扰问答
  text = text.replace(/[ \t]{2,}/g, ' ');
  for (const [re, to] of UNESCAPE) text = text.replace(re, to);
  return text.trim();
}
