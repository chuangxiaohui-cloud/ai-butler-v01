import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { extractHtmlText, httpFetchPage, parseHtmlBody } from './http-fetch.js';

test('http-fetch: extractHtmlText 剥离脚本/样式并保留正文段落', () => {
  const html =
    '<html><head><title>示例页面</title></head><body>' +
    '<nav>导航噪音</nav>' +
    '<article><h1>标题</h1><p>第一段正文内容。</p><p>第二段含 72MHz 数值。</p></article>' +
    '<footer>页脚</footer><script>alert(1)</script>' +
    '</body></html>';
  const { title, text } = extractHtmlText(html);
  assert.equal(title, '示例页面');
  assert.ok(text.includes('第一段正文内容'));
  assert.ok(text.includes('第二段含 72MHz 数值'));
  assert.ok(!text.includes('导航噪音'));
  assert.ok(!text.includes('页脚'));
  assert.ok(!text.includes('alert'));
});

test('http-fetch: extractHtmlText 空正文返回空文本', () => {
  const { text } = extractHtmlText('<html><body><script>var x=1</script></body></html>');
  assert.equal(text, '');
});

test('http-fetch: parseHtmlBody 非 HTML 无正文返回 null', () => {
  const r = parseHtmlBody(new TextEncoder().encode('<html><body><script>var x=1</script></body></html>'), 'https://example.com/x');
  assert.equal(r, null);
});

test('http-fetch: parseHtmlBody 正常 HTML 返回标题与正文', () => {
  const buf = new TextEncoder().encode('<html><head><title>T</title></head><body><p>正文 72MHz 内容</p></body></html>');
  const r = parseHtmlBody(buf, 'https://example.com/x');
  assert.ok(r);
  assert.equal(r.url, 'https://example.com/x');
  assert.equal(r.title, 'T');
  assert.ok(r.text.includes('正文 72MHz 内容'));
});

test('http-fetch: parseHtmlBody 按 maxChars 截断', () => {
  const buf = new TextEncoder().encode('<html><body><p>' + '很长的内容 '.repeat(50) + '</p></body></html>');
  const r = parseHtmlBody(buf, 'https://example.com/x', 20);
  assert.ok(r);
  assert.ok(r.text.length <= 20);
});

test('http-fetch: SSRF 拒绝回环地址不发起请求', async () => {
  const r = await httpFetchPage('http://127.0.0.1:8080/admin');
  assert.equal(r, null);
});

test('http-fetch: 非法协议被安全策略拒绝', async () => {
  const r = await httpFetchPage('file:///etc/passwd');
  assert.equal(r, null);
});
