#!/usr/bin/env node
/**
 * E255：市场 Skill pdf-merge 包装（E251 @input 文件通道）
 * 用法：npm run market:pdf:merge -- <input.txt>
 * input.txt 内容 = 用户 query：提取全部 PDF 路径（≥2），输出沙箱 <首文件名>-merged.pdf；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { extractFilePaths, mergePdfs } from '../src/skills/market/file-readers.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:pdf:merge -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const paths = extractFilePaths(inputText);
    if (paths.length < 2) {
      console.error(JSON.stringify({ ok: false, error: 'PDF 合并至少需要 2 个输入文件路径' }));
      process.exit(1);
    }
    const outputPath = join(dirname(inputFile), `${basename(paths[0], extname(paths[0]))}-merged.pdf`);
    const summary = await mergePdfs(paths, outputPath);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
