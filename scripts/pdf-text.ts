/**
 * 提取 PDF 文本层并打印命中关键词。
 *   npm run pdf:text -- <PDF 路径> [关键词...]
 */

import { readFileSync } from 'node:fs';

import { parseDocumentFile } from '../src/search/document-parser.js';

const file = process.argv[2];
const keywords = process.argv.slice(3);

async function main(): Promise<void> {
  if (!file) throw new Error('用法：npm run pdf:text -- <PDF 路径> [关键词]');
  const buffer = readFileSync(file);
  const text = await parseDocumentFile({
    name: file,
    type: 'application/pdf',
    size: buffer.byteLength,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  });
  const result: Record<string, unknown> = {
    chars: text.length,
    lines: text.split('\n').length,
    preview: text.slice(0, 500),
  };
  if (keywords.length > 0) {
    result.hits = keywords.map((keyword) => ({
      keyword,
      found: text.includes(keyword),
    }));
  }
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  });
