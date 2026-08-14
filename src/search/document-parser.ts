/**
 * 文档解析适配器（Week 5）
 * md/txt 直接解码；文本型 PDF 做轻量提取；docx 暂未接入。
 */

import type { RawFileLike } from '../skills/deps.js';

function decodePdfString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function extractPdfText(raw: string): string {
  const parts: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) parts.push(decodePdfString(m[1]));
    if (m[2] !== undefined) {
      const items = m[2].split(/\)\s*-?\d+\s*\(/);
      parts.push(items.map((s) => decodePdfString(s.replace(/^\(/, '').replace(/\)$/, ''))).join(''));
    }
  }
  return parts.join(' ');
}

export async function parseDocumentFile(file: RawFileLike): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime.startsWith('text/') || /\.(md|txt)$/i.test(name)) {
    return buffer.toString('utf-8');
  }
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    const text = extractPdfText(buffer.toString('latin1')).trim();
    if (text) return text;
    throw new Error('PDF 解析暂不支持扫描件/复杂版式');
  }
  if (/\.docx?$/i.test(name) || mime.includes('wordprocessingml') || mime === 'application/msword') {
    throw new Error('docx/doc 解析待接入');
  }
  throw new Error(`不支持的文件类型：${file.type || name}`);
}
