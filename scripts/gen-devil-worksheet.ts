#!/usr/bin/env node
/**
 * 从 bench/devil-v25/results.jsonl + scores.json 生成 v0.1 同款评分工作表。
 * 用法：npm run worksheet:devil-v25
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { renderWorksheetV01, type DevilWorksheetEntry } from './devil-worksheet-lib.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'bench', 'devil-v25');
const jsonlPath = join(outDir, 'results.jsonl');
const scoresPath = join(outDir, 'scores.json');
const outPath = join(outDir, 'scoring-worksheet.md');

if (!existsSync(jsonlPath)) {
  console.error('缺少 results.jsonl，请先跑 bench:devil-v25。');
  process.exit(1);
}

const entries: DevilWorksheetEntry[] = [];
for (const line of readFileSync(jsonlPath, 'utf-8').split(/\r?\n/)) {
  if (line.trim()) entries.push(JSON.parse(line) as DevilWorksheetEntry);
}

const scoresById = new Map<string, number>();
if (existsSync(scoresPath)) {
  const scores = (JSON.parse(readFileSync(scoresPath, 'utf-8')) as {
    scores: Array<{ id: string; score: number }>;
  }).scores;
  for (const s of scores) scoresById.set(s.id, s.score);
}

writeFileSync(outPath, renderWorksheetV01(entries, scoresById), 'utf-8');
console.log(`已生成：${outPath}（${entries.length} 条）`);
