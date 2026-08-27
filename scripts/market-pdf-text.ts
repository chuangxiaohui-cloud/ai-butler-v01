#!/usr/bin/env node
/**
 * E254：市场 Skill pdf-read 包装（E251 @input 文件通道）
 * 用法：npm run market:pdf:text -- <input.txt>
 * input.txt 内容 = 用户 query：提取 PDF/文本路径，其余词为关键词；输出 JSON 摘要；失败 exit 1。
 */

import { readFileSync } from 'node:fs';

import { parseInputArgs, readPdfTextSummary } from '../src/skills/market/file-readers.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:pdf:text -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const { path, args } = parseInputArgs(readFileSync(inputFile, 'utf-8'));
    const summary = await readPdfTextSummary(path, args);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
