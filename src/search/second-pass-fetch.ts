/**
 * 低置信二次取证执行器（P1/P2，架构审计 2026-08-23）
 *
 * P1：targets 并发抓取 + 共享总预算 [P-117]，预算耗尽整体放弃，不再逐目标串行叠加；
 *     PDF 解析改异步有界读取（[P-118] 大小上限），不再 readFileSync 同步读整份阻塞事件循环。
 * P2：取证 PDF 落盘用后即删，data/datasheets 不再无界增长。
 * P-YYY：HTML 目标改为 node 原生 HTTP 直抓优先（不依赖浏览器），空结果/失败再用浏览器兜底。
 */

import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { extractPartNumber } from './authority.js';
import { parseDocumentFile } from './document-parser.js';
import { httpFetchPage, type HttpFetchResult } from './http-fetch.js';
import type { RawFileLike } from '../skills/deps.js';
import { PARAMS } from '../config/params.js';
import type { BrowserFetcher } from './search-loop.js';
import type { SearchResultItem } from './providers/types.js';

export interface SecondPassFetchResult {
  target: SearchResultItem;
  text: string;
}

/** 单目标取证：HTML 优先 HTTP 直抓（P-YYY），空正文/失败降级浏览器会话；PDF 下载 → 有界异步解析 → 用后即删（P2） */
export async function fetchSecondPassTarget(
  target: SearchResultItem,
  query: string,
  session: BrowserFetcher | undefined,
  parseFile: (file: RawFileLike) => Promise<string> = parseDocumentFile,
  httpFetch: (url: string) => Promise<HttpFetchResult | null> = (u) => httpFetchPage(u, { timeoutMs: 8000 }),
): Promise<SecondPassFetchResult | null> {
  try {
    let text = '';
    if (/\.pdf(\?|#|$)/i.test(target.url)) {
      if (!session) return null;
      const safeName = (extractPartNumber(query) ?? 'datasheet').replace(/[^a-zA-Z0-9_-]+/g, '');
      const dest = resolve(process.cwd(), 'data', 'datasheets', `${safeName}-${Date.now()}.pdf`);
      try {
        const downloaded = await session.downloadFile(target.url, dest);
        if (downloaded.ok && downloaded.size > 0 && downloaded.size <= PARAMS.pdfParseMaxBytes) {
          const buffer = await readFile(dest);
          text = await parseFile({
            name: `${safeName}.pdf`,
            type: 'application/pdf',
            size: downloaded.size,
            arrayBuffer: async () =>
              buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
          });
        }
      } finally {
        await rm(dest, { force: true }).catch(() => undefined);
      }
    } else {
      const http = await httpFetch(target.url);
      text = http?.text ?? '';
      if (!text.trim() && session) {
        const page = await session.fetchPage(target.url, 8000, 3000);
        text = page.text;
      }
    }
    return text.trim().length > 0 ? { target, text } : null;
  } catch {
    return null;
  }
}

/** 带剩余预算竞速：预算耗尽即拒绝，任务先完成则清 timer 返回 */
function withBudget<T>(deadline: number, task: () => Promise<T>): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error('二次取证预算耗尽'));
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error('二次取证预算超时')), remaining);
    task().then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

/** 并发抓取全部 target，总墙钟 ≤ budgetMs（P1）；单个失败不影响其他目标 */
export async function fetchSecondPassTargets(
  targets: SearchResultItem[],
  query: string,
  session: BrowserFetcher | undefined,
  budgetMs: number,
  httpFetch: (url: string) => Promise<HttpFetchResult | null> = (u) => httpFetchPage(u, { timeoutMs: 8000 }),
): Promise<SecondPassFetchResult[]> {
  if (targets.length === 0) return [];
  const deadline = Date.now() + budgetMs;
  const settled = await Promise.allSettled(
    targets.map((target) =>
      withBudget(deadline, () => fetchSecondPassTarget(target, query, session, undefined, httpFetch)),
    ),
  );
  const results: SecondPassFetchResult[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) results.push(item.value);
  }
  return results;
}
