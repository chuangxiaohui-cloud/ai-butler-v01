#!/usr/bin/env node
/**
 * E257：市场 Skill image-compress 包装（E251 @input 文件通道）
 * 用法：npm run market:image:compress -- <input.txt>
 * input.txt 内容 = 用户 query：提取图片路径；参数中首个纯数字为 max_kb（缺省 200）。
 * 输出沙箱 <文件名>-compressed.jpg；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { compressImage, extractFilePath, parseInputArgs } from '../src/skills/market/file-readers.js';

const KB_RE = /^(\d+)$/;

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:image:compress -- <input.txt>' }));
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
    const kbMatch = args.find((arg) => KB_RE.test(arg));
    const maxKb = kbMatch ? Number(kbMatch) : null;
    const outputPath = join(dirname(inputFile), `${basename(path, extname(path))}-compressed.jpg`);
    const summary = await compressImage(path, outputPath, maxKb);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
