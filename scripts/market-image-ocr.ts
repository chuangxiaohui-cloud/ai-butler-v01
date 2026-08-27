#!/usr/bin/env node
/**
 * E258：市场 Skill image-ocr 包装（E251 @input 文件通道）
 * 用法：npm run market:image:ocr -- <input.txt>
 * input.txt 内容 = 用户 query：提取图片路径，其余词为关键词；
 * 输出沙箱 <文件名>-ocr.txt + 字符数/预览/关键词命中；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { extractFilePath, ocrText, parseInputArgs } from '../src/skills/market/file-readers.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:image:ocr -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const path = extractFilePath(inputText);
    if (!path) {
      console.error(JSON.stringify({ ok: false, error: '未找到图片路径' }));
      process.exit(1);
    }
    const { args } = parseInputArgs(inputText);
    const outputTxt = join(dirname(inputFile), `${basename(path, extname(path))}-ocr.txt`);
    const summary = await ocrText(path, outputTxt, args);
    if (!summary.ok) {
      console.error(JSON.stringify(summary, null, 2));
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          chars: summary.chars,
          textPreview: summary.text.slice(0, 400) + (summary.text.length > 400 ? '…' : ''),
          hits: summary.hits,
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
