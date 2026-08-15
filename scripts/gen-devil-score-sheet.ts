#!/usr/bin/env node
/**
 * 生成魔鬼训练 v2.5 可填写打分表（122 条全量）：
 * - bench/devil-v25/scores.sheet.csv（带 BOM，Excel 可直接打开）
 * - bench/devil-v25/scores.sheet.md（Markdown 版）
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface SheetRow {
  id: string;
  volume: string;
  query: string;
  expected: string;
  focus: string;
  initialScore: number;
  finalScore: number;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'bench', 'devil-v25');
const jsonlPath = join(outDir, 'results.jsonl');
const scoresPath = join(outDir, 'scores.json');
const csvPath = join(outDir, 'scores.sheet.csv');
const mdPath = join(outDir, 'scores.sheet.md');

if (!existsSync(jsonlPath) || !existsSync(scoresPath)) {
  console.error('缺少 results.jsonl 或 scores.json，请先跑 bench:devil-v25。');
  process.exit(1);
}

const rows = new Map<string, { volume: string; query: string; expected: string; focus: string }>();
for (const line of readFileSync(jsonlPath, 'utf-8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const entry = JSON.parse(line) as {
    row: { id: string; volume: string; query: string; expected: string; focus: string };
  };
  rows.set(entry.row.id, {
    volume: entry.row.volume,
    query: entry.row.query,
    expected: entry.row.expected,
    focus: entry.row.focus,
  });
}

const scores = (JSON.parse(readFileSync(scoresPath, 'utf-8')) as {
  scores: Array<{ id: string; score: number; initialScore?: number }>;
}).scores;

const sheet: SheetRow[] = scores.map((s) => {
  const r = rows.get(s.id);
  return {
    id: s.id,
    volume: r?.volume ?? '',
    query: r?.query ?? '',
    expected: r?.expected ?? '',
    focus: r?.focus ?? '',
    initialScore: s.initialScore ?? s.score,
    finalScore: s.score,
  };
});

const escCsv = (v: string) => {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
};

const header = ['ID', '卷册', '题目', '预期行为', '考察点', '我的初判分', '你的评分(0-3)', '备注'];
const csvLines = [
  header.map(escCsv).join(','),
  ...sheet.map((r) =>
    [r.id, r.volume, r.query, r.expected, r.focus, String(r.initialScore), String(r.finalScore), '']
      .map(escCsv)
      .join(','),
  ),
];
writeFileSync(csvPath, '\uFEFF' + csvLines.join('\r\n'), 'utf-8');

const md = [
  '# 魔鬼训练 v2.5 打分表（122 条全量）',
  '',
  '> 我的初判分已填，你在“你的评分(0-3)”列打分即可；0 分/3 分可批量接受，重点看 1-2 分项。',
  '',
  '| ID | 卷册 | 题目 | 预期行为 | 考察点 | 我的初判分 | 你的评分(0-3) | 备注 |',
  '|---|------|------|----------|--------|-----------|--------------|------|',
  ...sheet.map((r) => {
    const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    return `| ${r.id} | ${esc(r.volume)} | ${esc(r.query)} | ${esc(r.expected)} | ${esc(r.focus)} | ${r.initialScore} | ${r.finalScore} |  |`;
  }),
  '',
].join('\n');
writeFileSync(mdPath, md, 'utf-8');

console.log(`已生成：${csvPath}（${sheet.length} 条）`);
console.log(`已生成：${mdPath}（${sheet.length} 条）`);
