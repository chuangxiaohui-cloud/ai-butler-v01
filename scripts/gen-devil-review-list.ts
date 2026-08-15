#!/usr/bin/env node
/**
 * 生成魔鬼训练 v2.5 人工复核清单：
 * 从 scores.json + results.jsonl 抽取 1 分边界题与安全/合规题，
 * 输出 bench/devil-v25/scores.review-list.md，供 owner 快速复核。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'bench', 'devil-v25');
const scoresPath = join(outDir, 'scores.json');
const jsonlPath = join(outDir, 'results.jsonl');
const outPath = join(outDir, 'scores.review-list.md');

if (!existsSync(scoresPath) || !existsSync(jsonlPath)) {
  console.error('缺少 scores.json 或 results.jsonl，请先跑 bench:devil-v25。');
  process.exit(1);
}

const scores = (JSON.parse(readFileSync(scoresPath, 'utf-8')) as {
  scores: Array<{ id: string; score: number }>;
}).scores;
const byId = new Map(scores.map((s) => [s.id, s]));
const rows = new Map<string, { query: string; expected: string }>();
for (const line of readFileSync(jsonlPath, 'utf-8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const entry = JSON.parse(line) as {
    row: { id: string; query: string; expected: string };
  };
  rows.set(entry.row.id, { query: entry.row.query, expected: entry.row.expected });
}

const onePoint = scores.filter((s) => s.score === 1).map((s) => s.id);
const safety = ['EC04', 'EC05', 'EC12', 'EC13', 'EC26', 'EC27'];
const pick = [...new Set([...onePoint, ...safety])].filter((id) => rows.has(id));
const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const md = [
  '# 魔鬼训练 v2.5 人工复核清单',
  '',
  '> 已完成 122 条初判分（scores.json）。建议 0 分/3 分批量接受，下面列出重点复核题（1 分边界题 + 安全/合规题）。',
  '',
  '| ID | 指令 | 预期行为 | 我的初判分 | 你的评分(0-3) |',
  '|---|------|----------|-----------|--------------|',
  ...pick.map((id) => {
    const r = rows.get(id)!;
    return `| ${id} | ${esc(r.query)} | ${esc(r.expected)} | ${byId.get(id)!.score} |  |`;
  }),
  '',
  '## 批量接受建议',
  '',
  '- 0 分 45 条：多为路由误判/安全模板误触/未命中，可直接接受。',
  '- 3 分 29 条：回答完整且符合预期，可直接接受。',
  '- 2 分 36 条：基本满足预期，建议抽查后接受。',
  '',
].join('\n');

writeFileSync(outPath, md, 'utf-8');
console.log(`已生成复核清单：${outPath}（${pick.length} 条重点题）`);
