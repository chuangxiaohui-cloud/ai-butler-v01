import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { fetchSecondPassTarget, fetchSecondPassTargets } from './second-pass-fetch.js';
import type { BrowserFetcher } from './search-loop.js';
import type { SearchResultItem } from './providers/types.js';

const htmlTarget: SearchResultItem = {
  title: 't',
  url: 'https://example.com/stm32f103.html',
  content: 'x',
  provider: 'bocha',
};
const pdfTarget: SearchResultItem = {
  title: 'pdf',
  url: 'https://example.com/stm32f103.pdf',
  content: 'x',
  provider: 'bocha',
};

function sessionOver(opts: {
  fetchText?: string;
  fetchDelayMs?: number;
  download?: (url: string, destPath: string) => { ok: boolean; size: number };
}): BrowserFetcher {
  const fetchPage = async () => {
    if (opts.fetchDelayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, opts.fetchDelayMs));
    }
    if (opts.fetchText === 'hang') return await new Promise<never>(() => {});
    return { url: htmlTarget.url, title: 't', text: opts.fetchText ?? '' };
  };
  return {
    fetchPage,
    downloadFile: async (url, destPath) =>
      opts.download ? opts.download(url, destPath) : { ok: false, size: 0 },
  };
}

test('second-pass-fetch: HTML 目标 HTTP 直抓优先，无需浏览器会话（P-YYY）', async () => {
  const session = sessionOver({ fetchText: '不应走浏览器' });
  const result = await fetchSecondPassTarget(
    htmlTarget,
    'STM32F103C8T6',
    session,
    undefined,
    async () => ({ url: htmlTarget.url, title: 't', text: 'HTTP 直抓正文 72MHz' }),
  );
  assert.ok(result);
  assert.equal(result.text, 'HTTP 直抓正文 72MHz');
});

test('second-pass-fetch: HTTP 直抓失败时浏览器会话兜底', async () => {
  const session = sessionOver({ fetchText: ' 浏览器兜底正文 ' });
  const result = await fetchSecondPassTarget(
    htmlTarget,
    'STM32F103C8T6',
    session,
    undefined,
    async () => null,
  );
  assert.ok(result);
  assert.equal(result.text, ' 浏览器兜底正文 ');
});

test('second-pass-fetch: 无浏览器会话且 HTTP 直抓失败返回 null', async () => {
  const result = await fetchSecondPassTarget(
    htmlTarget,
    'STM32F103C8T6',
    undefined,
    undefined,
    async () => null,
  );
  assert.equal(result, null);
});

test('second-pass-fetch: HTTP 直抓空正文不产出结果', async () => {
  const session = sessionOver({ fetchText: '   ' });
  const result = await fetchSecondPassTarget(
    htmlTarget,
    'STM32F103C8T6',
    session,
    undefined,
    async () => ({ url: htmlTarget.url, title: 't', text: '' }),
  );
  assert.equal(result, null);
});

test('second-pass-fetch: PDF 解析后落盘文件被清理（P2）', async () => {
  const base = join(process.cwd(), 'data', 'datasheets');
  mkdirSync(base, { recursive: true });
  let dest: string | undefined;
  const session = sessionOver({
    download: (_url, destPath) => {
      dest = destPath;
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, Buffer.from('%PDF-1.4 fake'));
      return { ok: true, size: 14 };
    },
  });
  const result = await fetchSecondPassTarget(pdfTarget, 'STM32F103C8T6', session, async () => 'pdf 正文');
  assert.ok(result);
  assert.equal(result.text, 'pdf 正文');
  assert.ok(dest, 'download 应被调用');
  assert.equal(existsSync(dest), false, 'P2：取证 PDF 用后即删');
});

test('second-pass-fetch: PDF 超过解析大小上限直接跳过（P1 有界读取）', async () => {
  const session = sessionOver({
    download: () => ({ ok: true, size: 30 * 1024 * 1024 }),
  });
  let parseCalled = false;
  const result = await fetchSecondPassTarget(pdfTarget, 'STM32F103C8T6', session, async () => {
    parseCalled = true;
    return 'x';
  });
  assert.equal(result, null);
  assert.equal(parseCalled, false);
});

test('second-pass-fetch: 总预算超时快速返回，不串行等满各目标（P1）', async () => {
  const hang = sessionOver({ fetchText: 'hang' });
  const targets = [htmlTarget, { ...htmlTarget, url: 'https://example.com/2.html' }];
  const start = Date.now();
  const results = await fetchSecondPassTargets(targets, 'STM32F103C8T6', hang, 150,   async () => null,
  );
  assert.deepEqual(results, []);
  assert.ok(Date.now() - start < 3000, '预算生效，不等待 provider 自身超时');
});

test('second-pass-fetch: 目标并发抓取，总耗时≈最慢目标（P1）', async () => {
  const session = sessionOver({ fetchText: 'ok', fetchDelayMs: 120 });
  const targets = [htmlTarget, { ...htmlTarget, url: 'https://example.com/2.html' }];
  const start = Date.now();
  const results = await fetchSecondPassTargets(targets, 'STM32F103C8T6', session, 5000,   async () => null,
  );
  const elapsed = Date.now() - start;
  assert.equal(results.length, 2);
  assert.ok(elapsed < 300, `并发应≈最慢目标（120ms），实际 ${elapsed}ms`);
});
