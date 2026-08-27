#!/usr/bin/env node
/**
 * E254：市场 Skill pdf-compress 包装（E251 @input 文件通道）
 * 用法：npm run market:pdf:compress -- <input.txt>
 * input.txt 内容 = 用户 query：提取 PDF 路径，任意位置首个纯数字词为可选目标 max_kb；
 * 输出到沙箱同目录，报告压缩前后体积；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { compressPdf, parseInputArgs } from '../src/skills/market/file-readers.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:pdf:compress -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const { path, args } = parseInputArgs(readFileSync(inputFile, 'utf-8'));
    const maxKbText = args.find((arg) => /^\d+$/.test(arg));
    const maxKb = maxKbText !== undefined ? Number(maxKbText) : null;
    const outputPath = join(dirname(inputFile), `${basename(path, extname(path))}-compressed.pdf`);
    const summary = await compressPdf(path, outputPath, maxKb);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
