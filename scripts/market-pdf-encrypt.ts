#!/usr/bin/env node
/**
 * E255：市场 Skill pdf-encrypt 包装（E251 @input 文件通道）
 * 用法：npm run market:pdf:encrypt -- <input.txt>
 * input.txt 内容 = 用户 query：提取 PDF 路径；可选密码 = 参数中首个 3-32 位字母数字串
 * （中文触发词/路径不满足，自动排除；缺省 123456）；输出沙箱 <文件名>-encrypted.pdf；失败 exit 1。
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { encryptPdf, extractFilePaths, parseInputArgs } from '../src/skills/market/file-readers.js';

const PASSWORD_RE = /^[A-Za-z0-9]{3,32}$/;

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:pdf:encrypt -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const path = extractFilePaths(inputText)[0] ?? '';
    if (!path) {
      console.error(JSON.stringify({ ok: false, error: '未找到 PDF 路径' }));
      process.exit(1);
    }
    const { args } = parseInputArgs(inputText);
    const password = args.find((arg) => PASSWORD_RE.test(arg)) ?? null;
    const outputPath = join(dirname(inputFile), `${basename(path, extname(path))}-encrypted.pdf`);
    const summary = await encryptPdf(path, outputPath, password);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
