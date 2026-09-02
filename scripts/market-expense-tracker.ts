#!/usr/bin/env node
/**
 * E308：市场 Skill expense-tracker 包装（E251 @input 文件通道）
 * 用法：npm run market:expense:tracker -- <input.txt>
 * input.txt 内容 = 用户 query：查预算 / 记一笔支出 / 拨款设预算。
 * 输出 JSON（含各 scope 拨款/支出/余额）；失败 exit 1。
 */

import { readFileSync } from 'node:fs';

import { runBudgetCommand } from '../src/skills/market/expense.js';

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:expense:tracker -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const result = runBudgetCommand(inputText);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

void main();
