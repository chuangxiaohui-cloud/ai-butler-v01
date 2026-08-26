/**
 * 浏览器操作观察器（E252，§4.1.5 观察与寻址）
 * AX 树 + 可交互元素编号 + 视口/iframe 有界：每步快照 ≤ [P-126] 字符，超限截断并标记。
 * 页面观察内容一律归 untrusted_data（A13）：只输出纯文本结构，不进可执行上下文；
 * 元素文本做空白归一化，防止页面文本伪装成指令行注入动作计划。
 */

import { PARAMS } from '../config/params.js';

export interface DomObserveElement {
  /** 可交互元素编号（@N 寻址；非交互元素无编号） */
  ref?: number;
  tag: string;
  role?: string;
  text: string;
  attrs?: Record<string, string>;
  /** iframe 嵌套深度（视口/iframe 有界，默认截断深度 4） */
  frameDepth?: number;
}

export interface DomSnapshot {
  text: string;
  refs: Array<{ ref: number; tag: string; text: string }>;
  elementCount: number;
  interactiveCount: number;
  truncated: boolean;
  originalChars?: number;
}

export function renderDomSnapshot(
  elements: DomObserveElement[],
  opts: { maxChars?: number; maxFrameDepth?: number } = {},
): DomSnapshot {
  const maxChars = opts.maxChars ?? PARAMS.browserOpDomSnapshotMaxChars;
  const maxFrameDepth = opts.maxFrameDepth ?? 4;
  const inScope = elements.filter((el) => (el.frameDepth ?? 0) <= maxFrameDepth);
  const refs: DomSnapshot['refs'] = [];
  const lines: string[] = [];
  for (const el of inScope) {
    if (el.ref !== undefined) {
      refs.push({ ref: el.ref, tag: el.tag, text: normalize(el.text).slice(0, 80) });
    }
    lines.push(formatElement(el));
  }
  const raw = lines.join('\n');
  const truncated = raw.length > maxChars;
  const text = truncated
    ? `${raw.slice(0, maxChars)}\n…（快照超 [P-126] 已截断，原 ${raw.length} 字符）`
    : raw;
  return {
    text,
    refs,
    elementCount: elements.length,
    interactiveCount: refs.length,
    truncated,
    ...(truncated ? { originalChars: raw.length } : {}),
  };
}

function formatElement(el: DomObserveElement): string {
  const label = el.role ? `${el.tag}[${el.role}]` : el.tag;
  const prefix = el.ref !== undefined ? `[ref=${el.ref}]` : '';
  const attrs = el.attrs
    ? Object.entries(el.attrs)
        .map(([key, value]) => ` ${key}="${normalize(value)}"`)
        .join('')
    : '';
  const frame = el.frameDepth !== undefined && el.frameDepth > 0 ? ` frame=${el.frameDepth}` : '';
  const text = normalize(el.text).slice(0, 200);
  return `${prefix} ${label}${attrs}${frame}${text ? `: ${text}` : ''}`.trim();
}

/** 空白归一化：多行/多空格压成单空格，页面文本无法夹带换行伪装成新步骤（A13） */
function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}