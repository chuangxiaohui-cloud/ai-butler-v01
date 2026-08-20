/**
 * 查看 PDF 坐标提取与符号包围盒检测结果。
 *   npm run pdf:symbols -- <PDF 路径> [页码]
 */

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./pdf_symbols.py', import.meta.url));
const file = process.argv[2];
const pageNo = Number(process.argv[3] ?? 1);
if (!file) throw new Error('用法：npm run pdf:symbols -- <PDF 路径> [页码]');

const stdout = await new Promise<string>((resolve, reject) => {
  const child = spawn('python', [SCRIPT, file], { windowsHide: true });
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (c: string) => {
    out += c;
  });
  child.stderr.on('data', (c: string) => {
    err += c;
  });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve(out);
    else reject(new Error(err.trim() || `python exit ${code}`));
  });
});
const parsed = JSON.parse(stdout) as {
  ok: boolean;
  pages?: Array<{
    page: number;
    wordCount: number;
    textSymbols: unknown[];
    drawingSymbols: unknown[];
    designators?: string[];
  }>;
  error?: string;
};
if (!parsed.ok) throw new Error(parsed.error ?? 'pdf_symbols failed');
const page = parsed.pages?.find((p) => p.page === pageNo);
if (!page) throw new Error(`未找到第 ${pageNo} 页`);
console.log(JSON.stringify({
  page: page.page,
  wordCount: page.wordCount,
  textSymbols: page.textSymbols.length,
  drawingSymbols: page.drawingSymbols.length,
  symbolsWithDesignator: page.textSymbols.filter(
    (s) => (s as { designators?: string[] }).designators?.length,
  ).length,
  textSymbolSample: page.textSymbols.slice(0, 10),
  drawingSymbolSample: page.drawingSymbols.slice(0, 10),
}, null, 2));
