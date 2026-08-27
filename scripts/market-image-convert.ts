#!/usr/bin/env node
/**
 * E255：市场 Skill image-convert 包装（E251 @input 文件通道）
 * 用法：npm run market:image:convert -- <input.txt>
 * input.txt 内容 = 用户 query：提取图片路径，目标格式取参数中 png/jpg/jpeg/webp/bmp；
 * 输出沙箱 <文件名>.<格式>；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { convertImage, extractFilePaths, parseInputArgs } from '../src/skills/market/file-readers.js';

const FORMATS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']);

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:image:convert -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const path = extractFilePaths(inputText)[0] ?? '';
    if (!path) {
      console.error(JSON.stringify({ ok: false, error: '未找到图片路径' }));
      process.exit(1);
    }
    const { args } = parseInputArgs(inputText);
    const format = args.find((arg) => FORMATS.has(arg.toLowerCase())) ?? 'webp';
    const outputPath = join(dirname(inputFile), `${basename(path, extname(path))}.${format.toLowerCase()}`);
    const summary = await convertImage(path, outputPath, format);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
