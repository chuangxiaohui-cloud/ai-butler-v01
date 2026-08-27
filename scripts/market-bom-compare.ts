#!/usr/bin/env node
/**
 * E256：市场 Skill bom-compare 包装（E251 @input 文件通道）
 * 用法：npm run market:bom:compare -- <input.txt>
 * input.txt 内容 = 用户 query：提取两个 BOM 文件路径（xls/xlsx），自动定位位号列，
 * 输出 公共/仅 A/仅 B/变更 四类差异；失败 exit 1。
 */

import { readFileSync } from 'node:fs';

import { compareBoms, extractFilePaths } from '../src/skills/market/file-readers.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:bom:compare -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const paths = extractFilePaths(inputText);
    if (paths.length < 2) {
      console.error(JSON.stringify({ ok: false, error: 'BOM 对比至少需要 2 个表格文件路径' }));
      process.exit(1);
    }
    const summary = await compareBoms(paths[0], paths[1], null);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
