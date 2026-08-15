/**
 * 文档解析适配器（Week 5）
 * md/txt 直接解码；PDF 优先用 PyMuPDF 提取文本层，失败回退轻量 Tj/TJ 提取；docx 暂未接入。
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import type { RawFileLike } from '../skills/deps.js';

const PDF_TEXT_SCRIPT = fileURLToPath(new URL('../../scripts/pdf_text.py', import.meta.url));
const PYTHON_CANDIDATES = ['python', 'python3'];

interface PdfTextResult {
  ok: boolean;
  text?: string;
  scanned?: boolean;
  ocr?: boolean;
  ocrAvailable?: boolean;
  ocrMaxPages?: number;
  ocrSkippedPages?: number;
  ocrError?: string;
  pageCount?: number;
  textPages?: number;
  error?: string;
}

async function parsePdfWithPython(buffer: Buffer): Promise<PdfTextResult | null> {
  for (const cmd of PYTHON_CANDIDATES) {
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(cmd, [PDF_TEXT_SCRIPT], {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          out += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          err += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) resolve(out);
          else reject(new Error(err.trim() || `python exit ${code}`));
        });
        child.stdin.end(buffer);
      });
      const parsed = JSON.parse(stdout.trim()) as PdfTextResult;
      if (parsed && typeof parsed.ok === 'boolean') return parsed;
    } catch {
      // 尝试下一个候选解释器；全部失败时走 Node 轻量回退
    }
  }
  return null;
}

function decodePdfString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function collectPdfText(source: string): string {
  const parts: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[1] !== undefined) parts.push(decodePdfString(m[1]));
    if (m[2] !== undefined) {
      const items = m[2].split(/\)\s*-?\d+\s*\(/);
      parts.push(items.map((s) => decodePdfString(s.replace(/^\(/, '').replace(/\)$/, ''))).join(''));
    }
  }
  return parts.join(' ');
}

function extractPdfText(raw: string): string {
  const direct = collectPdfText(raw);
  if (direct) return direct;
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    try {
      const decoded = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      const text = collectPdfText(decoded);
      if (text) return text;
    } catch {
      // 非 FlateDecode 流，跳过
    }
  }
  return direct;
}

export async function parseDocumentFile(file: RawFileLike): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime.startsWith('text/') || /\.(md|txt)$/i.test(name)) {
    return buffer.toString('utf-8');
  }
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    const viaPython = await parsePdfWithPython(buffer);
    if (viaPython?.text?.trim()) return viaPython.text.trim();
    const text = extractPdfText(buffer.toString('latin1')).trim();
    if (text) return text;
    throw new Error(
      viaPython?.scanned
        ? viaPython.ocrAvailable === false
          ? 'PDF 解析：扫描件无文本层，且 OCR 引擎未安装；请运行 `python -m pip install rapidocr_onnxruntime` 后重试'
          : 'PDF 解析：扫描件无文本层，OCR 识别失败；建议改用厂商网页参数页或上传带文本层的 PDF'
        : 'PDF 解析暂不支持扫描件/无文本层/复杂版式',
    );
  }
  if (/\.docx?$/i.test(name) || mime.includes('wordprocessingml') || mime === 'application/msword') {
    throw new Error('docx/doc 解析待接入');
  }
  throw new Error(`不支持的文件类型：${file.type || name}`);
}
