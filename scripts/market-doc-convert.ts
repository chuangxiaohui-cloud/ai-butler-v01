#!/usr/bin/env node
/**
 * E256：市场 Skill doc-convert 包装（E251 @input 文件通道）
 * 用法：npm run market:doc:convert -- <input.txt>
 * input.txt 内容 = 用户 query：
 * - 含「速读/读取/摘要/总结」触发词 → 文档（docx/doc）速读摘要 + 关键词命中；
 * - 否则 → 文档互转（docx/doc → PDF，Word COM），输出沙箱 <文件名>-converted.pdf。
 * 失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import {
  convertDocToPdf,
  extractFilePath,
  parseInputArgs,
  readDocSummary,
} from '../src/skills/market/file-readers.js';

const READ_TRIGGER = /速读|读取|摘要|总结|提取关键词/;

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:doc:convert -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const path = extractFilePath(inputText);
    if (!path) {
      console.error(JSON.stringify({ ok: false, error: '未找到 docx/doc 文件路径' }));
      process.exit(1);
    }
    if (READ_TRIGGER.test(inputText)) {
      const { args } = parseInputArgs(inputText);
      const summary = await readDocSummary(path, args);
      console.log(JSON.stringify(summary, null, 2));
      process.exit(summary.ok ? 0 : 1);
    }
    const outputPdf = join(dirname(inputFile), `${basename(path, extname(path))}-converted.pdf`);
    const summary = await convertDocToPdf(path, outputPdf);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
