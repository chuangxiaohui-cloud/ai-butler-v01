import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseDocumentFile } from './document-parser.js';

function fakeFile(name: string, type: string, content: string | Uint8Array) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

test('document-parser: markdown 直接解码', async () => {
  const text = await parseDocumentFile(
    fakeFile('doc.md', 'text/markdown', '# 标题\n\n正文'),
  );
  assert.ok(text.includes('# 标题'));
});

test('document-parser: 文本型 PDF 提取 Tj/TJ 内容', async () => {
  const raw = '%PDF-1.4\nBT\n(Hello) Tj (World) Tj\nET\n%%EOF';
  const text = await parseDocumentFile(fakeFile('a.pdf', 'application/pdf', raw));
  assert.ok(text.includes('Hello'));
  assert.ok(text.includes('World'));
});

test('document-parser: docx 未接入时明确报错', async () => {
  await assert.rejects(
    parseDocumentFile(fakeFile('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x')),
    /待接入/,
  );
});
