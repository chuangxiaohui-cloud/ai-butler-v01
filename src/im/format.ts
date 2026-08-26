/**
 * v1.0 S5：IM 输出适配（§4.5 输出适配）
 * 正文消息尽量短；长报告改发链接或文件，避免刷屏。
 * 超过 maxLength 截断并标记 truncated + attachmentHint（真实 IM 接入后发文件）。
 */

import { PARAMS } from '../config/params.js';

export interface ImReply {
  text: string;
  truncated?: boolean;
  attachmentHint?: string;
}

export const DEFAULT_IM_MAX_LENGTH = PARAMS.imMaxLength; // [P-123]

export function adaptReply(
  answer: string,
  opts: { maxLength?: number; attachmentHint?: string } = {},
): ImReply {
  const maxLength = opts.maxLength ?? DEFAULT_IM_MAX_LENGTH;
  const text = answer ?? '';
  if (text.length <= maxLength) {
    return { text, attachmentHint: opts.attachmentHint };
  }
  const cut = text.slice(0, maxLength);
  const tailIndex = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('。'), cut.lastIndexOf('，'));
  const head = tailIndex > maxLength * 0.5 ? cut.slice(0, tailIndex + 1) : cut;
  return {
    text: `${head}……（内容较长，已截断）`,
    truncated: true,
    attachmentHint: opts.attachmentHint ?? '详细内容可查看完整报告/链接',
  };
}
