import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

import { parseDocumentFile } from './document-parser.js';

function fakeFile(name: string, type: string, content: string | Uint8Array) {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  };
}

function buildPdf(streamBody: string, compress = false): Uint8Array {
  const objectBodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [0];
  let length = parts[0].length;
  for (let i = 0; i < objectBodies.length; i += 1) {
    offsets.push(length);
    const body = Buffer.from(`${i + 1} 0 obj\n${objectBodies[i]}\nendobj\n`, 'latin1');
    parts.push(body);
    length += body.length;
  }
  const raw = Buffer.from(streamBody, 'latin1');
  const stream = compress ? deflateSync(raw) : raw;
  offsets.push(length);
  const streamObj = Buffer.concat([
    Buffer.from('5 0 obj\n<< /Length ', 'latin1'),
    Buffer.from(String(stream.length), 'latin1'),
    Buffer.from(compress ? ' /Filter /FlateDecode ' : ' ', 'latin1'),
    Buffer.from('>>\nstream\n', 'latin1'),
    stream,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
  parts.push(streamObj);
  length += streamObj.length;
  const xrefOffset = length;
  const xref = Buffer.from(
    `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
      .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    'latin1',
  );
  parts.push(xref);
  return Buffer.concat(parts);
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

test('document-parser: FlateDecode 压缩流 PDF 提取文本', async () => {
  const pdf = buildPdf('BT /F1 12 Tf 72 720 Td (Hello World 72MHz) Tj ET', true);
  const text = await parseDocumentFile(fakeFile('a.pdf', 'application/pdf', pdf));
  assert.ok(text.includes('Hello World'));
  assert.ok(text.includes('72MHz'));
});

test('document-parser: 无文本层 PDF 明确报错', async () => {
  const pdf = buildPdf('', false);
  await assert.rejects(
    parseDocumentFile(fakeFile('blank.pdf', 'application/pdf', pdf)),
    /无文本层/,
  );
});

test('document-parser: docx 未接入时明确报错', async () => {
  await assert.rejects(
    parseDocumentFile(fakeFile('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x')),
    /待接入/,
  );
});
