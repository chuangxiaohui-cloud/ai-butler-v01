/**
 * 抓取资料页并下载 datasheet PDF。
 *   npm run datasheet -- "URL" [型号]
 * 优先选择锚文本含 datasheet/数据手册 的链接，其次匹配型号，否则取第一个 PDF。
 */

import { resolve } from 'path';

import { browserSession } from '../src/browser/session.js';

const url = process.argv[2];
const part = process.argv[3]?.trim().toUpperCase();

async function main(): Promise<void> {
  if (!url) throw new Error('用法：npm run datasheet -- "URL" [型号]');
  const page = await browserSession.fetchPage(url, 30_000, 5000);
  const links = page.pdfLinks ?? [];
  const picked =
    links.find((l) => /datasheet|数据手册|data sheet/i.test(l.text)) ??
    links.find((l) => part && l.url.toUpperCase().includes(part)) ??
    links.find((l) => !/isoiec/i.test(l.url)) ??
    links[0];
  if (!picked) {
    console.log(JSON.stringify({ error: '页面中未找到 PDF 链接', url: page.url, pdfLinks: links }, null, 2));
    process.exit(1);
  }
  const safeName = (part ?? url.replace(/[^a-zA-Z0-9]+/g, '-')).replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 60);
  const dest = resolve(process.cwd(), 'data', 'datasheets', `${safeName}.pdf`);
  const downloaded = await browserSession.downloadFile(picked.url, dest);
  console.log(JSON.stringify({
    pageUrl: page.url,
    title: page.title,
    pdfLinks: links,
    picked: picked.url,
    downloaded,
    path: dest,
  }, null, 2));
  if (!downloaded.ok) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  });
