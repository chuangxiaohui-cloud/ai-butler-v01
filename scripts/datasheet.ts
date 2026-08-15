/**
 * 抓取资料页并下载 datasheet PDF。
 *   npm run datasheet -- "URL" [型号]
 * 优先选择锚文本含 datasheet/数据手册 的链接，其次匹配型号，否则按页面顺序；
 * 下载后解析文本校验型号前缀（E83），不匹配就换下一个候选并删除误存文件。
 */

import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'path';

import { browserSession } from '../src/browser/session.js';
import { parseDocumentFile } from '../src/search/document-parser.js';
import { normalizePart, verifyDatasheetText } from '../src/search/datasheet-verify.js';

const url = process.argv[2];
const part = process.argv[3]?.trim().toUpperCase() ?? '';

interface PdfLink {
  url: string;
  text: string;
}

function rankCandidates(links: PdfLink[], part: string): PdfLink[] {
  const normalizedPart = normalizePart(part);
  return [
    ...links.filter((l) => /datasheet|数据手册|data sheet/i.test(l.text)),
    ...links.filter((l) =>
      normalizedPart
        ? l.url.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(normalizedPart)
        : false,
    ),
    ...links.filter((l) => !/isoiec/i.test(l.url)),
    ...links,
  ].filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i);
}

async function verifyLocalPdf(
  dest: string,
  part: string,
): Promise<{ match: boolean; textChars?: number; error?: string }> {
  if (!normalizePart(part)) return { match: true };
  try {
    const buffer = readFileSync(dest);
    const text = await parseDocumentFile({
      name: 'datasheet.pdf',
      type: 'application/pdf',
      size: buffer.byteLength,
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    });
    return { match: verifyDatasheetText(text, part), textChars: text.length };
  } catch (err) {
    return { match: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  if (!url) throw new Error('用法：npm run datasheet -- "URL" [型号]');
  const page = await browserSession.fetchPage(url, 30_000, 5000);
  const links = page.pdfLinks ?? [];
  const candidates = rankCandidates(links, part);
  const safeName = (part || url.replace(/[^a-zA-Z0-9]+/g, '-')).replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 60);
  const dest = resolve(process.cwd(), 'data', 'datasheets', `${safeName}.pdf`);
  const attempts: Array<{
    url: string;
    text: string;
    downloaded: { ok: boolean; size: number; error?: string };
    verified?: { match: boolean; textChars?: number; error?: string };
  }> = [];
  let picked: PdfLink | null = null;
  let lastDownload: { ok: boolean; size: number; error?: string } | null = null;

  for (const candidate of candidates) {
    const downloaded = await browserSession.downloadFile(candidate.url, dest);
    lastDownload = downloaded;
    const attempt: {
      url: string;
      text: string;
      downloaded: { ok: boolean; size: number; error?: string };
      verified?: { match: boolean; textChars?: number; error?: string };
    } = { url: candidate.url, text: candidate.text, downloaded };
    if (downloaded.ok) {
      const verified = await verifyLocalPdf(dest, part);
      attempt.verified = verified;
      attempts.push(attempt);
      if (verified.match) {
        picked = candidate;
        break;
      }
      rmSync(dest, { force: true });
    } else {
      attempts.push(attempt);
    }
  }

  if (!picked || !lastDownload?.ok) {
    console.log(JSON.stringify({
      error: part
        ? '没有找到内容匹配型号的 PDF（不匹配文件已删除）'
        : '页面中未找到可用的 PDF 链接',
      pageUrl: page.url,
      title: page.title,
      pdfLinks: links,
      attempts,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    pageUrl: page.url,
    title: page.title,
    pdfLinks: links,
    picked: picked.url,
    downloaded: lastDownload,
    path: dest,
    attempts,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  });
