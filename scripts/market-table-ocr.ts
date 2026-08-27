#!/usr/bin/env node
/**
 * E256：市场 Skill table-ocr 包装（E251 @input 文件通道）
 * 用法：npm run market:table:ocr -- <input.txt>
 * input.txt 内容 = 用户 query：提取图片/PDF 路径 → RapidOCR 表格重建，
 * 输出沙箱 <文件名>-table.csv + 行列摘要；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { extractFilePath, ocrTable } from '../src/skills/market/file-readers.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:table:ocr -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const path = extractFilePath(inputText);
    if (!path) {
      console.error(JSON.stringify({ ok: false, error: '未找到表格图片/PDF 路径' }));
      process.exit(1);
    }
    const outputCsv = join(dirname(inputFile), `${basename(path, extname(path))}-table.csv`);
    const summary = await ocrTable(path, outputCsv);
    if (!summary.ok) {
      console.error(JSON.stringify(summary, null, 2));
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          rows: summary.rows,
          cols: summary.cols,
          csvPreview: summary.csv.slice(0, 400) + (summary.csv.length > 400 ? '…' : ''),
          warnings: summary.warnings,
          outputPath: summary.outputPath,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
