/**
 * HTTP 直抓正文（通用问答管道修复 P-YYY）
 * 不依赖浏览器：node 原生 fetch 抓 HTML + 轻量正文提取（剥噪音标签、块级换行、空白压缩）。
 * 供 P0 四步链路「检索→抓正文→LLM 作答」使用；浏览器抓取降为二级兜底。
 * 纯机制实现：不包含任何领域关键词/域名/实体。
 */

import { isBlockedBrowserUrl } from '../security/url-safety.js';
import { PARAMS } from '../config/params.js';

export interface HttpFetchResult {
  url: string;
  title: string;
  text: string;
}

/** 噪音标签：整块跳过（不产出文本） */
const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'form', 'button',
  'input', 'select', 'textarea', 'nav', 'header', 'footer', 'aside',
]);

/** 块级标签：标签位置转换为换行，保证段落边界可读 */
const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'blockquote', 'td', 'th',
  'dt', 'dd', 'figcaption', 'caption', 'summary', 'div', 'section', 'article',
  'ul', 'ol', 'table', 'tr', 'br', 'hr',
]);

/** 从 HTML 字符串提取标题与正文（纯正则，无外部依赖） */
export function extractHtmlText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = (titleMatch?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  // 优先 main/article，退而求其次 body——正文页结构与引擎无关
  const mainMatch =
    /<main[\s\S]*?<\/main>/i.exec(html) ??
    /<article[\s\S]*?<\/article>/i.exec(html) ??
    /<body[\s\S]*?<\/body>/i.exec(html);
  let body = mainMatch?.[0] ?? html;
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const text = cleaned
    .replace(/<[^>]+>/g, (tag: string) => {
      const name = (tag.match(/^<\/?([a-z0-9]+)/i)?.[1] ?? '').toLowerCase();
      if (SKIP_TAGS.has(name)) return ' ';
      if (BLOCK_TAGS.has(name)) return '\n';
      return ' ';
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

function decodeHtml(buf: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  // 中文站点常见 GBK/GB18030：UTF-8 解码出现大量替换符时换码表重试（与领域无关的编码探测）
  if ((utf8.match(/\uFFFD/g) ?? []).length > 10) {
    try {
      return new TextDecoder('gb18030').decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

/** 解码 + 正文提取（HTTP 响应体 → 可读文本）；空正文返回 null。
 * 独立导出便于离线单测（不依赖网络）。
 */
export function parseHtmlBody(
  buf: Uint8Array,
  url: string,
  maxChars?: number,
): HttpFetchResult | null {
  const html = decodeHtml(buf);
  const { title, text } = extractHtmlText(html);
  if (!text.trim()) return null;
  return { url, title, text: text.slice(0, maxChars ?? PARAMS.knowledgePageFetchChars) };
}

/**
 * HTTP 直抓单个网页正文。
 * 返回 null 表示不可抓取（SSRF 拒绝 / 非 HTML / HTTP 错误 / 超时 / 空正文）。
 */
export async function httpFetchPage(
  url: string,
  opts: { timeoutMs?: number; maxChars?: number } = {},
): Promise<HttpFetchResult | null> {
  if (isBlockedBrowserUrl(url).blocked) return null;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxChars = opts.maxChars ?? PARAMS.knowledgePageFetchChars;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AI-Butler/0.1)',
        'accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!resp.ok) return null;
    const type = resp.headers.get('content-type') ?? '';
    if (!/html|text\/plain/i.test(type)) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    return parseHtmlBody(buf, url, maxChars);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
