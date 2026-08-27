#!/usr/bin/env node
/**
 * E258：市场 Skill reminder 包装（E251 @input 文件通道）
 * 用法：npm run market:reminder -- <input.txt>
 * input.txt 内容 = 用户 query：
 * - 含「查询/查看/我的提醒」→ 列出待触发提醒（前 10 条）；
 * - 否则 → 新增提醒（time-expression 解析时间/重复/提前量），落 data/reminders.db。
 * 失败 exit 1。
 */

import { readFileSync } from 'node:fs';

import { runReminderCommand } from '../src/skills/market/reminder.js';

function main(): void {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:reminder -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const result = runReminderCommand(inputText);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

main();
