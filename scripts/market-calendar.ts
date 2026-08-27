#!/usr/bin/env node
/**
 * E259：市场 Skill calendar 包装（E251 @input 文件通道）
 * 用法：npm run market:calendar -- <input.txt>
 * input.txt 内容 = 用户 query：
 * - 含「导出/保存 日历/日程/ics」→ 导出全部日程为 .ics 落盘；
 * - 含「查询/查看/我的日程」→ 列出最近 10 条日程；
 * - 否则 → 新增日程（time-expression 解析时间/重复/提前量），同步登记提醒，
 *   落 data/calendar.db。
 * 失败 exit 1。
 */

import { readFileSync } from 'node:fs';

import { runCalendarCommand } from '../src/skills/market/calendar.js';

function main(): void {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error(JSON.stringify({ ok: false, error: '用法：npm run market:calendar -- <input.txt>' }));
    process.exit(1);
  }
  try {
    const inputText = readFileSync(inputFile, 'utf-8');
    const result = runCalendarCommand(inputText);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  }
}

main();
